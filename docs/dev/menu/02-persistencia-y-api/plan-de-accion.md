# Plan de acción — Tarea 2 · Persistencia y API de menú (E1)

**Rama:** `dev/menu`  
**Épica:** E1 Menú (RF1). Tarea 2 de 3. Solo esta.  
**Fecha:** 30 de septiembre de 2026  
**Estado:** cerrado el 30 de septiembre de 2026.  
**Análisis:** `analisis.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Resultado

Un cliente HTTP crea, lista, edita y desactiva platos. Al reiniciar la API, el mismo id vuelve con el mismo nombre, centavos, tasa, estado, orden de modificadores, precio del extra y precio `null` de la exclusión.

Los casos de uso que ya pasan sus 49 pruebas siguen igual. El módulo Nest es el único que instancia `DrizzleMenuRepository`.

## 2. No se toca

- Reglas y firmas de `Money`, `TaxRate`, `Modifier`, `MenuItem`, `CreateMenuItem`, `ListMenuItems`, `UpdateMenuItem`, `DeactivateMenuItem`.
- `InMemoryMenuRepository`, salvo que un test nuevo lo use como ya está.
- `GET /health` y `GET /health/database`.
- `apps/web/**`.
- `drizzle/0000_abnormal_jigsaw.sql`, `drizzle/meta/_journal.json` y el snapshot, a mano.
- Seeds, órdenes, pagos.

## 3. Decisiones

| Tema | Decisión |
|------|----------|
| Orden de modificadores | Columna `position` integer not null, default `0`, check `>= 0`. Lectura `order by position, id` |
| Orden de platos en `list` | El adaptador Drizzle usa `id` ascendente. El caso no ordena. El doble en memoria no se cambia |
| Lectura | `MenuItem.restore`. Nunca `create` |
| Exclusión guardada | `price_amount` y `price_currency` nulos. En JSON, `"price": null` |
| Fila ilegible para el dominio | `MenuItemMappingError`. No se rellena moneda ni precio |
| Escritura | Una transacción por `add` y por `save` |
| Id duplicado en `add` | Solo el código Postgres `23505` de la PK de `menu_items` pasa a `MenuItemAlreadyExistsError` |
| Ids de producto | `crypto.randomUUID` en el composition root |
| Zod | Forma y tipos. `.strict()`. Sin rango de dinero ni “si falta el precio, pon 0” |
| Tests de HTTP | Módulo Nest de prueba + doble en memoria, puerto libre, como `database-health.controller.spec.ts` |
| Tests de Drizzle | Transacción con rollback. `pnpm test` los salta sin `DATABASE_URL`. `pnpm test:db` los exige |
| Cuerpo de error | `{ "code", "message" }` sin stack y sin texto del driver |

## 4. Capas

- **Dominio:** no cambia.
- **Aplicación:** `MenuItemMappingError` al lado de `MenuItemNotFoundError`. Los casos se registran en Nest; su código queda.
- **Adaptador driven:** esquema, migración generada, mapper, `DrizzleMenuRepository`.
- **Adaptador driving:** Zod, presentador, controller. Traduce clases de error a HTTP.
- **Composition root:** token `MENU_REPOSITORY`, repositorio Drizzle, casos con `crypto.randomUUID`.

## 5. Pasos

### Paso 1 — Columna `position`

En `apps/api/src/infrastructure/persistence/drizzle/schema/menu.ts`, sobre `menuItemModifiers`:

- `position`: `integer`, not null, default `0`.
- check `position >= 0`.

Comandos, con Postgres en la URL de `apps/api/.env`:

1. `pnpm --filter @restaurante/api db:generate`
2. Revisar el SQL generado: solo agrega la columna y el check. No reescribe la migración `0000`.
3. `pnpm --filter @restaurante/api db:migrate`
4. Comprobar en `restaurante` que `menu_item_modifiers.position` existe, es not null y tiene default `0`.

Si no hay Postgres, parar. No escribir el SQL a mano.

### Paso 2 — Mapper y repositorio

Archivos:

- `apps/api/src/application/menu/menu-item-repository.errors.ts` — agregar `MenuItemMappingError` con mensaje fijo `Stored menu item does not match the catalog rules`.
- `apps/api/src/infrastructure/persistence/drizzle/menu-item.mapper.ts`
- `apps/api/src/infrastructure/persistence/drizzle/drizzle-menu-repository.ts`
- `apps/api/src/infrastructure/persistence/drizzle/drizzle-menu-repository.integration.spec.ts`

Mapper, de filas ya cargadas a `MenuItem`:

- Captura cualquier error de dominio (`InvalidMoneyError`, `InvalidTaxRateError`, `ExtraMissingPriceError`, `ExclusionHasPriceError`, `BlankNameError`, `BlankIdError`) y lanza `MenuItemMappingError`.
- No usa `?? 0` ni `?? 'MXN'`.

Repositorio, constructor con el mismo tipo de base que acepta transacción (el `db` de `createDatabase` o el `tx` del callback):

- `add`: transacción. Inserta el plato. Inserta modificadores con `position` igual al índice. Si Postgres devuelve `23505` sobre `menu_items`, lanza `MenuItemAlreadyExistsError`.
- `save`: transacción. `update` del plato por id. Si no hay fila, `MenuItemNotFoundError`. Luego `delete` de hijas de ese `menu_item_id` e insert de la lista nueva.
- `findById`: `null` si no hay plato. Si hay plato y el mapper falla, propaga `MenuItemMappingError`.
- `list`: todos los platos, `id` ascendente, cada uno con sus hijas ordenadas. Una fila ilegible tumba la lista entera con `MenuItemMappingError`.

El spec de integración:

- Si `process.env.DATABASE_URL` no está, `describe.skip`.
- Si está, abre cliente, corre cada caso en una transacción y hace rollback aunque el caso falle.
- No trunca la tabla.

### Paso 3 — HTTP sin base

Archivos:

- `apps/api/src/interface/http/menu/menu-item.schema.ts`
- `apps/api/src/interface/http/menu/menu-item.presenter.ts`
- `apps/api/src/interface/http/menu/menu-http.errors.ts`
- `apps/api/src/interface/http/menu/menu-item.controller.ts`
- `apps/api/src/interface/http/menu/menu-item.controller.spec.ts`

Zod del alta y de la edición:

- `name` string, `price.amount` number, `price.currency` string, `applicableTax.basisPoints` number.
- `modifiers`: arreglo de objetos con `name` string, `kind` string, y `price` opcional `{ amount: number, currency: string }`.
- La edición agrega `active` boolean.
- `.strict()` en el cuerpo, en `price`, en `applicableTax` y en cada modificador.
- El id de edición y de baja sale solo del param. Un cuerpo con `id` es 400.
- La baja no lleva cuerpo útil. Si llega JSON con campos, 400.

Presentador: el objeto de la sección 5 del análisis. `price` de una exclusión es `null`, no se borra la clave.

`menu-http.errors.ts` es la única tabla de traducción. El controller la usa en los cuatro métodos. Códigos de la sección 8. Un error que no esté en la tabla se relanza para que Nest responda 500 sin cuerpo de dominio inventado.

Spec: `NestFactory` en puerto `0`, logger apagado, providers con `InMemoryMenuRepository` y un `generateId` de secuencia. No importa Drizzle ni abre `AppModule`.

### Paso 4 — Cableado

En `AppModule.register`:

- Token `MENU_REPOSITORY`.
- `useValue: new DrizzleMenuRepository(db)`.
- `ListMenuItems` y `DeactivateMenuItem` reciben el puerto.
- `CreateMenuItem` y `UpdateMenuItem` reciben el puerto y `() => crypto.randomUUID()`.
- Controller de menú en `controllers`, junto a los de health.

`main.ts` no cambia de flujo: sigue cargando `.env`, exigiendo `DATABASE_URL` y haciendo ping antes de escuchar. El `db` que ya crea es el que entra a `register`.

### Paso 5 — Cierre

1. `env -u DATABASE_URL pnpm --filter @restaurante/api test` — la integración aparece como skipped; el resto pasa, incluidos los 49 anteriores.
2. `pnpm --filter @restaurante/api test:db` — corre el spec de integración de verdad. Falla si `DATABASE_URL` no está o si el spec se saltó.
3. `pnpm --filter @restaurante/api typecheck`.
4. `pnpm dev:restart` y el smoke HTTP de la sección 10 contra `http://localhost:3001`.

## 6. Archivos nuevos de soporte

En `apps/api/package.json`, script:

```text
test:db = vitest run src/infrastructure/persistence/drizzle/drizzle-menu-repository.integration.spec.ts
```

Ese comando hereda el entorno. Quien lo corra exporta `DATABASE_URL` o usa el valor de `apps/api/.env` desde el shell. El spec no llama a `loadApiEnv` y no pone una URL de relleno si falta la variable: falla con un mensaje que pide `DATABASE_URL`.

Dentro del spec, si el archivo se ejecutó con vitest y no hay URL, lanza al cargar. El `describe.skip` del paso 2 aplica solo cuando este archivo lo incluye la suite general `test`. La forma concreta: el skip ocurre cuando `process.env.MENU_REPOSITORY_INTEGRATION` no es `1`. El script `test:db` pone esa variable en `1` y, si además falta `DATABASE_URL`, el spec falla. La suite normal no define la variable y deja el `describe` en skip.

Así `pnpm test` no exige Postgres y `test:db` no puede ponerse verde sin haber hablado con la base.

## 7. Catálogo sin Postgres

Generador de prueba: `item-1`, `mod-1`, `mod-2`, …

| Id | Petición | Entonces |
|----|----------|----------|
| H1 | `POST` válido con extra y exclusión | 201. Cuerpo con ids, `active: true`, extra con precio, exclusión con `price: null`. `find` del doble devuelve el mismo orden |
| H2 | `GET` sin datos | 200 y `[]` |
| H3 | `GET` tras H1 y tras desactivar otro plato | 200 con activo e inactivo |
| H4 | `PATCH` del id de H1 con nombre nuevo y lista de un solo extra | 200, mismo `id` de plato, un modificador, id de modificador distinto |
| H5 | `POST …/deactivate` | 200, `active: false`, modificadores iguales |
| H6 | `POST …/deactivate` otra vez | 200, sigue inactivo |
| H7 | `PATCH` y `POST deactivate` de un id que no está | 404, `code` `MenuItemNotFoundError` |
| H8 | `POST` con nombre `"   "` | 422, `BlankNameError`. El doble sigue vacío |
| H9 | `POST` con `price.amount` `1.5` | 422, `InvalidMoneyError` |
| H10 | `POST` con `currency` `USD` | 422, `InvalidMoneyError` |
| H11 | `POST` con `basisPoints` `-1` | 422, `InvalidTaxRateError` |
| H12 | `POST` con extra sin `price` | 422, `ExtraMissingPriceError` |
| H13 | `POST` con exclusión que trae `price` | 422, `ExclusionHasPriceError` |
| H14 | `POST` con `kind` `note` | 422, `InvalidModifierKindError` |
| H15 | `POST` con `price.amount` `"4500"` (string) o sin `applicableTax` | 400, `InvalidRequest`. El doble no recibe `add` |
| H16 | `PATCH` con cuerpo `{ "id": "otro", ...válido }` | 400. El plato original no cambia |
| H17 | `GET` de health en el mismo `main` no es de este spec | No se reescribe el spec de health. La suite completa lo sigue corriendo |

H8–H14 usan un espía o el doble y comprueban que no aumentó el número de platos.

## 8. Catálogo con Postgres

Todos hacen rollback.

| Id | Entonces |
|----|----------|
| P1 | `add` de plato con extra en posición 0 y exclusión en posición 1. `findById` devuelve ese orden, centavos, `MXN`, tasa, `active true`, precio de exclusión `null` |
| P2 | Cerrar el repositorio no aplica: otro `DrizzleMenuRepository` sobre la misma transacción aún ve la fila. El rollback posterior la deja fuera de la base. El smoke S2 cubre el proceso nuevo |
| P3 | `save` cambia nombre y deja un solo modificador. `findById` no trae los modificadores viejos. El `id` del plato sigue |
| P4 | `save` de un id ausente lanza `MenuItemNotFoundError` y no inserta hijas |
| P5 | Segundo `add` con el mismo id lanza `MenuItemAlreadyExistsError`. El primero sigue con su modificador |
| P6 | Insertar por SQL un plato `price_currency = 'USD'` (el check de longitud lo permite) y `findById` lanza `MenuItemMappingError`. No devuelve un `MenuItem` |
| P7 | `list` incluye un activo y un inactivo insertados en la transacción, ordenados por `id` |
| P8 | Una exclusión escrita por el repositorio queda con `price_amount` y `price_currency` nulos en la tabla. Un extra queda con ambos informados |

P6 borra esa fila dentro de la transacción antes del rollback, o el rollback alcanza también el SQL crudo. No se deja `USD` commiteado.

## 9. Traducción HTTP

| Clase | Status | `code` |
|-------|--------|--------|
| Error de Zod | 400 | `InvalidRequest` |
| `BlankNameError` | 422 | `BlankNameError` |
| `BlankIdError` | 422 | `BlankIdError` |
| `InvalidMoneyError` | 422 | `InvalidMoneyError` |
| `InvalidTaxRateError` | 422 | `InvalidTaxRateError` |
| `InvalidModifierKindError` | 422 | `InvalidModifierKindError` |
| `ExtraMissingPriceError` | 422 | `ExtraMissingPriceError` |
| `ExclusionHasPriceError` | 422 | `ExclusionHasPriceError` |
| `MenuItemNotFoundError` | 404 | `MenuItemNotFoundError` |
| `MenuItemAlreadyExistsError` | 409 | `MenuItemAlreadyExistsError` |
| `MenuItemMappingError` | 500 | `MenuItemMappingError` |

El `message` del 400 es el del primer issue de Zod, sin el body recibido. El del resto es `error.message` de esa clase.

## 10. Smoke de sistema

Con `pnpm dev:restart`, base real, sin rollback:

| Id | Pasos | Entonces |
|----|-------|----------|
| S1 | `GET /health` y `GET /health/database` | 200 y el cuerpo de siempre |
| S2 | `POST /menu-items` con extra y exclusión. `pnpm dev:restart`. `GET /menu-items` | El id creado sigue, mismo precio, misma tasa, mismo orden de modificadores, exclusión con `price` null |
| S3 | `PATCH` de ese id con nombre distinto. `POST …/deactivate`. `GET` | Nombre nuevo, `active` false |
| S4 | `PATCH` de `id-que-no-existe` | 404, `MenuItemNotFoundError`, cuerpo sin `postgres` ni stack |
| S5 | `POST` con `amount` negativo | 422, `InvalidMoneyError` |
| S6 | `GET http://localhost:3000/` | 200 y la home actual |

S2 deja una fila real. No es un seed de producto: al anotar el cierre, apuntar el id usado para poder reconocerlo. No borrar otras filas de la tabla.

## 11. Hecho cuando

- [x] Migración nueva generada con Drizzle Kit y aplicada. `position` visible en la base
- [x] H1–H16 pasan dentro de `pnpm test` sin `DATABASE_URL`
- [x] Los tests de la tarea 1 y de health siguen pasando
- [x] `test:db` ejecuta P1–P8 y pasa
- [x] S1–S6 anotados con fecha
- [x] `AppModule` es el único que hace `new DrizzleMenuRepository` en el arranque. El spec de integración también lo construye, porque P2 pide otro repositorio sobre la misma transacción
- [x] Ningún archivo de `domain/` importa Drizzle, Nest, Zod o HTTP
- [x] No hay pantallas nuevas

Al cerrar, tabla en este archivo: comando, cuántas pruebas, y pasó o falló por H, P y S.

## 12. Cierre — 30 de septiembre de 2026

| Familia | Comando | Resultado |
|---------|---------|-----------|
| H | `env -u DATABASE_URL pnpm --filter @restaurante/api test` | Pasó. 12 archivos y 66 pruebas, incluidos H1–H16, la tarea 1 y health. 1 archivo y 8 pruebas skipped: P1–P8, porque esa suite no define `MENU_REPOSITORY_INTEGRATION=1` |
| P | `pnpm --filter @restaurante/api test:db` con `DATABASE_URL` de `apps/api/.env` | Pasó. 1 archivo, 8 pruebas, P1–P8 |
| Typecheck | `pnpm --filter @restaurante/api typecheck` | Pasó |
| S1–S6 | `pnpm dev:restart` y HTTP contra `http://localhost:3001` y la home en `http://localhost:3000` | Pasó. Fecha: 30 de septiembre de 2026 |

S2 creó el plato `d11d0b9f-dd9b-4010-b0fe-1ad1a63a62fa`. Tras el reinicio siguió con precio 4500 MXN, tasa 1600, extra en `position` 0 y exclusión en `position` 1 con precio nulo. S3 lo dejó con nombre `Tacos de suadero` y `active` false. Esa fila sigue en `menu_items`. No es un seed y no se borró.

S4 respondió 404 `{"code":"MenuItemNotFoundError","message":"Menu item was not found"}`, sin `postgres` ni stack. S5 respondió 422 `InvalidMoneyError`. S6 devolvió 200 y el `<h1>Sistema de Pedidos</h1>` de la home actual.

`domain/` no importa Drizzle, Nest, Zod ni HTTP. No hay pantallas nuevas. En el arranque, solo `AppModule` hace `new DrizzleMenuRepository`.

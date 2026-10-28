# Plan de acción — Tarea 2 · Persistencia y API de órdenes y cocina (E2 + E3)

**Rama:** `dev/comanda`  
**Sprint:** 2 (RF2–RF3). Tarea 2 de 3. Solo esta.  
**Fecha:** 4 de octubre de 2026  
**Estado:** acordado el 4 de octubre de 2026. Empieza cuando la tarea 1 esté cerrada.  
**Análisis:** `analisis.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Resultado

Un cliente HTTP abre una orden por mesa o externo, agrega, modifica y quita líneas, la manda a cocina, la marca lista o la cancela. Al reiniciar la API, la orden vuelve con el mismo estado, las mismas líneas en el mismo orden y los mismos precios capturados. Editar en cocina responde 409 `OrderNotEditableError`. Corregir un plato del menú no altera las líneas ya pedidas.

Los casos de uso y sus pruebas de la tarea 1 siguen iguales. Solo `AppModule` instancia `DrizzleOrderRepository` en el arranque.

## 2. No se toca

- Dominio y casos de orden, salvo agregar `OrderMappingError` en `order-repository.errors.ts`.
- Todo el menú: dominio, casos, `DrizzleMenuRepository`, `schema/menu.ts`, controller y su spec.
- `client.ts`, `main.ts`, health.
- Migraciones `0000`–`0003`, `_journal.json` y snapshots, a mano.
- `apps/web/**`.

## 3. Decisiones

| Tema | Decisión |
|------|----------|
| Esquema | `schema/order.ts` aparte. `drizzle.config.ts` pasa `schema` a `['./src/infrastructure/persistence/drizzle/schema/menu.ts', './src/infrastructure/persistence/drizzle/schema/order.ts']` |
| Registro en `client.ts` | No. El repositorio usa el query builder con las tablas importadas |
| Tipo de base | `OrderDatabase` = `AppDatabase` o el `tx` de una transacción, igual que `MenuDatabase` |
| Escritura | Una transacción por `add` y por `save` |
| Concurrencia | `update … where id = ? and version = ?`, escribe `version + 1` |
| Líneas en `save` | Borrar y reinsertar dentro de la transacción |
| Modificadores de línea | PK `(order_line_id, position)`. Sin FK al menú |
| `openedAt` | `timestamptz`. JSON en ISO 8601 UTC |
| Filtro de estado | `?status=OPEN,IN_KITCHEN`. Valores desconocidos: 400 |
| Zod | `.strict()`. Forma y tipo. Sin rangos de negocio: la cantidad `100` llega al dominio y responde 422 |
| Id de ruta | Solo de la ruta. Un cuerpo con `orderId` o `lineId` es 400 |
| Cuerpo vacío | `start-cooking`, `mark-ready` y `cancel` aceptan `{}` o sin cuerpo; con campos, 400 |
| Tests HTTP | Módulo Nest de prueba con los dos dobles en memoria, puerto libre. Sin `AppModule` ni Drizzle |
| Tests Drizzle | Rollback por caso. Variable `ORDER_REPOSITORY_INTEGRATION=1`. No truncan |

## 4. Capas

- **Aplicación:** `OrderMappingError`.
- **Driven:** esquema, migración, mapper, repositorio, spec de integración.
- **Driving:** Zod, presentador, errores HTTP, controller, spec.
- **Composition root:** `ORDER_REPOSITORY` y los nueve casos en `AppModule`.

## 5. Pasos

Cada paso cierra en verde con `env -u DATABASE_URL pnpm --filter @restaurante/api test` y `typecheck`. Los pasos 1 y 2 además con Postgres.

### Paso 0 — Línea base

1. `pnpm dev:status` y `GET /health/database` en 200.
2. `env -u DATABASE_URL pnpm --filter @restaurante/api test` y `pnpm --filter @restaurante/api test:db`. Anotar cuántas pruebas pasan antes de tocar nada. Ese número no puede bajar.

**Línea base — 4 de octubre de 2026**

| Comando | Resultado |
|---------|-----------|
| `pnpm dev:status` | `restaurante-api` y `restaurante-web` online |
| `GET /health/database` | 200 `{"status":"ok","service":"restaurante-api"}` |
| `env -u DATABASE_URL pnpm --filter @restaurante/api test` | 27 archivos, **177 pruebas** pasadas; 8 skipped (P menú) |
| `pnpm --filter @restaurante/api typecheck` | Pasó |
| `pnpm --filter @restaurante/api test:db` (con `DATABASE_URL` de `.env`) | 1 archivo, **8 pruebas** (P1–P8 menú) |

Piso que no puede bajar: **177** en `pnpm test` (sin contar skipped) y **8** en `test:db`.

### Paso 1 — Esquema y migración

1. `apps/api/src/infrastructure/persistence/drizzle/schema/order.ts` con las tres tablas, checks, índices y FKs de la sección 4 del análisis.
2. `apps/api/drizzle.config.ts`: `schema` como lista con los dos archivos.
3. `pnpm --filter @restaurante/api db:generate`.
4. **Revisar el SQL generado antes de migrar:**
   - Crea `orders`, `order_lines`, `order_line_modifiers`.
   - No hay `DROP` ni `ALTER` sobre tablas del menú.
   - Hay único sobre `external_order_id` y **no** hay único sobre `table_id`.
   - La FK de `order_lines.menu_item_id` es `ON DELETE restrict` (o `no action`), no `cascade`.
   - No hay `INSERT`.
5. `pnpm --filter @restaurante/api db:migrate`.
6. Comprobar en `restaurante`: `\d orders`, `\d order_lines`, `\d order_line_modifiers`.

Si el SQL no cumple, se corrige `schema/order.ts`, se borra **solo** la migración recién generada con Drizzle Kit (`drizzle-kit drop`) y se vuelve a generar. No se edita el SQL a mano. Si no hay Postgres, parar.

**Cierre Paso 1 — 4 de octubre de 2026:** migración `0004_blushing_adam_destine.sql` generada por Drizzle Kit y aplicada. Tablas `orders`, `order_lines`, `order_line_modifiers` en la BD. Único en `external_order_id`; FK a menú `ON DELETE RESTRICT`; sin único en `table_id`; sin `INSERT`. Tests: 177 + 8 `test:db` siguen verdes.

### Paso 2 — Mapper y repositorio

Archivos:

- `apps/api/src/application/order/order-repository.errors.ts` — `OrderMappingError`, mensaje `Stored order does not match the order rules`.
- `apps/api/src/infrastructure/persistence/drizzle/order.mapper.ts`
- `apps/api/src/infrastructure/persistence/drizzle/drizzle-order-repository.ts`
- `apps/api/src/infrastructure/persistence/drizzle/drizzle-order-repository.integration.spec.ts`
- `apps/api/package.json` — `test:db` corre los dos specs de integración con sus dos variables.

```text
test:db = MENU_REPOSITORY_INTEGRATION=1 ORDER_REPOSITORY_INTEGRATION=1 vitest run src/infrastructure/persistence/drizzle/drizzle-menu-repository.integration.spec.ts src/infrastructure/persistence/drizzle/drizzle-order-repository.integration.spec.ts
```

El spec: `describe.skip` si la variable no es `1`; si es `1` y falta `DATABASE_URL`, lanza al cargar. Cada caso en transacción con rollback, aunque falle. Los platos que necesite se insertan con `DrizzleMenuRepository` dentro de la misma transacción.

Pruebas P1–P14.

**Cierre Paso 2 — 4 de octubre de 2026:** `OrderMappingError`, `order.mapper.ts`, `DrizzleOrderRepository` y spec P1–P14. `test:db` corre menú + órdenes. Tests: 177 (+ 22 skipped: P menú y P órdenes) en `pnpm test`; **22** en `test:db` (8 menú + 14 órdenes). Typecheck OK. Sin cableado en `AppModule` ni HTTP.

### Paso 3 — HTTP sin base

Archivos en `apps/api/src/interface/http/order/`:

- `order.schema.ts` — cuerpos de abrir, agregar, modificar, cuerpo vacío, query de estado.
- `order.presenter.ts` — JSON de la sección 6 del análisis.
- `order-http.errors.ts` — única tabla de traducción.
- `order.controller.ts`
- `order.controller.spec.ts`

Spec con `NestFactory` en puerto `0`, logger apagado, `InMemoryOrderRepository`, `InMemoryMenuRepository` con los platos de fixture, `generateId` de secuencia y `now` fijo. Pruebas H1–H24.

**Cierre Paso 3 — 4 de octubre de 2026:** HTTP de órdenes con Zod, presentador, tabla de errores y controller. Spec H1–H25 con dobles en memoria (sin `AppModule` ni Drizzle). Tests: **203** (+ 22 skipped) en `pnpm test`. Typecheck OK. Sin cableado en arranque real.

### Paso 4 — Cableado

En `AppModule.register`:

- `ORDER_REPOSITORY` con `useValue: new DrizzleOrderRepository(db)`.
- Los nueve casos con `inject: [ORDER_REPOSITORY]` o `[ORDER_REPOSITORY, MENU_REPOSITORY]`.
- `OpenOrder`, `AddLine` reciben `() => crypto.randomUUID()`. `OpenOrder` recibe `() => new Date()`.
- `OrderController` en `controllers`.

**Cierre Paso 4 — 4 de octubre de 2026:** `AppModule.register` cablea `ORDER_REPOSITORY` → `DrizzleOrderRepository(db)`, los nueve casos (`OpenOrder`/`AddLine` con `crypto.randomUUID` y `() => new Date()`) y `OrderController`. Tests: **203** (+ 22 skipped). Typecheck OK. Smoke del sistema queda para el Paso 5.

### Paso 5 — Cierre

1. `env -u DATABASE_URL pnpm --filter @restaurante/api test`: integración en skipped; el resto pasa. Número de pruebas mayor que el del paso 0.
2. `pnpm --filter @restaurante/api test:db`: P del menú y de órdenes.
3. `pnpm --filter @restaurante/api typecheck`.
4. `pnpm dev:restart` y smoke de la sección 9.
5. Anotar la sección 11.

**Cierre Paso 5 — 4 de octubre de 2026:** suite + `test:db` + typecheck verdes; smoke S1–S9 contra API real. Antes de S2 se reactivó `Agua de jamaica` (estaba `active: false`). Detalle en §11.

## 6. Catálogo con Postgres

Todas hacen rollback. Plato de prueba: Tacos con `Queso` y omitir `Cilantro`, insertado con `DrizzleMenuRepository` en la misma transacción.

| Id | Entonces |
|----|----------|
| P1 | `add` de orden por mesa sin líneas. `findById` trae `OPEN`, `tableId`, `externalOrderId` `null`, `openedAt` igual al milisegundo, `version` 0 |
| P2 | `add` de orden externa. Lo mismo con el origen invertido |
| P3 | `save` con dos líneas: la segunda con extra y omitir. Releer: orden de líneas, cantidad, precio, tasa, modificadores en orden, exclusión con precio `null`, `version` 1 |
| P4 | `save` que quita la primera línea. Releer: una sola línea, sin modificadores huérfanos en `order_line_modifiers` |
| P5 | Dos lecturas de la misma versión. `save` de la primera pasa; `save` de la segunda lanza `OrderConcurrencyError` y la fila sigue con lo de la primera |
| P6 | `save` de un id ausente lanza `OrderNotFoundError` y no inserta líneas |
| P7 | Segundo `add` con el mismo id lanza `OrderAlreadyExistsError` |
| P8 | Dos órdenes `OPEN` en la misma mesa se guardan las dos; `list` trae ambas |
| P9 | `externalOrderId` repetido con `add` directo (sin pasar por el caso): `ExternalOrderIdInUseError` desde el único |
| P10 | `externalOrderId` repetido aunque la primera esté `CANCELLED`: `ExternalOrderIdInUseError` |
| P11 | Tras guardar la línea, `DrizzleMenuRepository.save` del plato con otro precio y modificadores nuevos. Releer la orden: precio y modificadores de la línea siguen iguales |
| P12 | `list` con filtro `[IN_KITCHEN]` y con `null`: filtro correcto, orden por `opened_at` y luego `id` |
| P13 | Una fila con `status = 'COOKING'` (insertada por SQL; el check la rechaza) cae en `23514`. Una fila con `unit_price_currency = 'USD'` (el check la permite) hace que `findById` lance `OrderMappingError` |
| P14 | En la tabla, un extra de línea tiene precio y moneda; una exclusión tiene ambos nulos. `quantity = 0` y `quantity = 100` por SQL caen en `23514` |

## 7. Catálogo HTTP sin Postgres

Generador `order-1`, `line-1`, …; reloj fijo `2026-10-04T18:00:00.000Z`.

| Id | Petición | Entonces |
|----|----------|----------|
| H1 | `POST /orders` `{ tableId: "5" }` | 201, `status` `OPEN`, `tableId` `"5"`, `externalOrderId` `null`, `lines` `[]`, `allowedActions` `["editLines","cancel"]`, `openedAt` el del reloj |
| H2 | `POST /orders` `{ externalOrderId: "UBER-1" }` | 201, origen invertido |
| H3 | `POST /orders` `{}` y con los dos campos | 422 `InvalidOrderOriginError` |
| H4 | `POST /orders` `{ tableId: "   " }` | 422 `InvalidTableIdError` |
| H5 | `POST /orders` `{ tableId: 5 }` o con un campo extra | 400 `InvalidRequest` |
| H6 | Segunda `POST /orders` en la mesa `"5"`; segunda con externo `"UBER-1"` | 201 con otro id / 409 `ExternalOrderIdInUseError` |
| H7 | `GET /orders/:id` y `GET /orders/no-existe` | 200 / 404 `OrderNotFoundError` |
| H8 | `POST …/lines` Tacos ×2 con `Queso` | 201, una línea, `unitPrice` 4500, modificador con precio, `allowedActions` incluye `startCooking` |
| H9 | `POST …/lines` con `quantity` `0` y `100` | 422 `InvalidQuantityError` |
| H10 | `POST …/lines` con `quantity` `"2"` | 400 |
| H11 | `POST …/lines` con `menuItemId` inexistente | 422 `MenuItemNotFoundError` |
| H12 | `POST …/lines` con plato inactivo | 422 `MenuItemUnavailableError` |
| H13 | `POST …/lines` con modificador ajeno o repetido | 422 `UnknownModifierError` / `DuplicateModifierSelectionError` |
| H14 | `PATCH …/lines/:lineId` cantidad 3 | 200, mismo `lineId` |
| H15 | `PATCH` o `DELETE` de `lineId` inexistente | 404 `LineItemNotFoundError` |
| H16 | `DELETE …/lines/:lineId` | 200, línea fuera |
| H17 | `POST …/start-cooking` sin líneas | 422 `EmptyOrderError` |
| H18 | `POST …/start-cooking` con líneas | 200, `IN_KITCHEN`, `allowedActions` `["markReady","cancel"]` |
| H19 | En `IN_KITCHEN`: `POST …/lines`, `PATCH`, `DELETE` | 409 `OrderNotEditableError` en cada uno; la orden no cambia |
| H20 | `POST …/start-cooking` otra vez | 409 `InvalidOrderTransitionError` |
| H21 | `POST …/mark-ready` | 200 `READY`, `allowedActions` `[]` |
| H22 | `POST …/cancel` sobre `READY`; sobre una `OPEN` nueva | 409 / 200 `CANCELLED` |
| H23 | `GET /orders?status=IN_KITCHEN,READY`, `?status=COOKING`, sin `status` | filtrado / 400 / todas |
| H24 | Un error no traducido (doble que lanza `Error`) | 500 sin `code` de dominio inventado |

H9–H13, H17 y H19 comprueban además que el doble no recibió `save`.

## 8. Concurrencia por HTTP

Una prueba más en el spec del controller, con el doble real:

| Id | Pasos | Entonces |
|----|-------|----------|
| H25 | Doble espía que, justo antes del `save` de `AddLine`, guarda la misma orden en `IN_KITCHEN` | La respuesta es 409 `OrderConcurrencyError`. `GET` devuelve `IN_KITCHEN` sin la línea |

## 9. Smoke de sistema

Con `pnpm dev:restart`, base real, sin rollback. Contra `http://localhost:3001`.

| Id | Pasos | Entonces |
|----|-------|----------|
| S1 | `GET /health`, `GET /health/database`, `GET /menu-items` | 200; el menú sigue con los cinco platos de la demo |
| S2 | `POST /orders` mesa `"S2-1"`; agregar Tacos ×2 con `Queso` y Agua ×1 con omitir `Azúcar` | 201 en cada paso |
| S3 | `pnpm dev:restart`; `GET /orders/:id` | Misma orden, mismas líneas, mismos precios |
| S4 | `POST …/start-cooking`; luego `POST …/lines` | 200 `IN_KITCHEN`; 409 `OrderNotEditableError`, sin `postgres` ni stack |
| S5 | `GET /orders?status=IN_KITCHEN` | Incluye la orden de S2 |
| S6 | `POST …/mark-ready` | 200 `READY` |
| S7 | `POST /orders` mesa `"S2-1"` otra vez | 201, otra comanda con otro id; `GET /orders?status=OPEN,READY` trae las dos de esa mesa |
| S8 | `POST /orders` externo `"S2-EXT-1"`; agregar una línea; `POST …/cancel` | 200 `CANCELLED`; otro `POST` con `"S2-EXT-1"` da 409 |
| S9 | `GET https://restaurante.localhost/menu` | 200; el admin del menú sigue |

Las órdenes del smoke quedan en la base. No son seeds. Se anotan sus ids en el cierre para reconocerlas. No se borran otras filas.

```bash
curl -sS -X POST http://localhost:3001/orders -H 'Content-Type: application/json' -d '{"tableId":"S2-1"}'
curl -sS -X POST http://localhost:3001/orders/$ORDER_ID/lines -H 'Content-Type: application/json' \
  -d "{\"menuItemId\":\"$TACOS_ID\",\"quantity\":2,\"modifierIds\":[\"$QUESO_ID\"]}"
curl -sS -X POST http://localhost:3001/orders/$ORDER_ID/start-cooking -H 'Content-Type: application/json' -d '{}'
```

## 10. Hecho cuando

- [x] Migración generada por Drizzle Kit, revisada y aplicada; las tres tablas en la base
- [x] P1–P14 pasan en `test:db`, junto con P1–P8 del menú
- [x] H1–H25 pasan en `pnpm test` sin `DATABASE_URL`
- [x] Las pruebas de la tarea 1 y del menú siguen pasando; el número total no bajó
- [x] S1–S9 anotados con fecha
- [x] Ningún JSON trae nombres de tabla, `version` ni totales
- [x] `domain/` no importa Drizzle, Nest, Zod ni HTTP
- [x] Solo `AppModule` hace `new DrizzleOrderRepository` en el arranque
- [x] `apps/web` no cambió

## 11. Cierre

**Fecha:** 4 de octubre de 2026. Tarea 2 (persistencia + API de órdenes y cocina) cerrada.

| Familia | Comando | Resultado |
|---------|---------|-----------|
| Unit / HTTP | `env -u DATABASE_URL pnpm --filter @restaurante/api test` | 28 archivos, **203** pruebas; 22 skipped (P menú + P órdenes) |
| Integración | `pnpm --filter @restaurante/api test:db` (con `DATABASE_URL` de `apps/api/.env`) | 2 archivos, **22** pruebas (8 menú + 14 órdenes) |
| Typecheck | `pnpm --filter @restaurante/api typecheck` | Pasó |
| Smoke | `pnpm dev:restart` + S1–S9 contra `http://localhost:3001` | Pasó |

**Nota de smoke:** `Agua de jamaica` estaba inactiva; se reactivó con `PATCH /menu-items/:id` para poder cumplir S2 (Tacos + Agua omitir Azúcar). El menú sigue con 5 platos.

**Ids de órdenes del smoke (quedan en la BD):**

| Id smoke | order id | Origen / estado final |
|----------|----------|------------------------|
| S2 / S3–S6 | `3f2325fe-3dfd-4241-8b79-bc05cdcd32f9` | mesa `S2-1` → `READY` |
| S7 | `7844ce85-fbb7-47ce-88ce-990155347675` | mesa `S2-1` → `OPEN` |
| S8 | `af1ee99d-36a8-4402-966f-319d5ae5b769` | externo `S2-EXT-1` → `CANCELLED` |
| Intento S2 fallido (solo Tacos; Agua aún inactiva) | `3a928775-9295-4701-a1f7-4f972b283766` | mesa `S2-1` → `OPEN` |

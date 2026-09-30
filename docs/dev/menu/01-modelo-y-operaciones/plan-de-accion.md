# Plan de acción — Tarea 1 · Modelo y operaciones de menú (E1)

**Rama:** `dev/menu`  
**Épica:** E1 Menú (RF1). Tarea 1 de 3. Solo esta.  
**Fecha:** 30 de septiembre de 2026  
**Estado:** cerrado. Implementación anotada el 30 de septiembre de 2026.  
**Análisis:** `analisis.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Resultado

Se puede crear, listar, editar y desactivar un plato con precio, tasa y modificadores. Las pruebas corren con un repositorio en memoria. No hace falta Postgres, ni la API de menú, ni el navegador.

Un plato inválido no llega a `add` ni a `save`. Un id que no existe no se crea por la puerta de editar o desactivar. Desactivar dos veces no escribe la segunda. Los datos que estas pruebas aceptan son datos que los checks de `menu_items` y `menu_item_modifiers` también aceptarían.

## 2. No se toca

- `apps/api/src/app.module.ts`, `main.ts`, controllers, Zod.
- `apps/api/src/infrastructure/persistence/drizzle/**` y cualquier migración.
- `apps/web/**`.
- `CheckDatabaseConnection` y sus pruebas.
- Órdenes, cocina, totales, cobro.

Si al implementar aparecen archivos fuera de la sección 6, se listan y se acuerda antes de seguir.

## 3. Decisiones cerradas para implementar

| Tema | Decisión |
|------|----------|
| Precio | Centavos enteros, `0` … `2_147_483_647`, moneda `MXN` |
| Tasa | Puntos base enteros en el mismo rango. `0` es válido. No calcula la cuenta |
| Extra | Lleva `Money`. Monto `0` es extra gratis |
| Exclusión | Sin precio. `null` en el modelo, no cero |
| Alta | Siempre `active: true`. El comando no trae el flag |
| Edición | Reemplaza nombre, precio, tasa, `active` y la lista entera de modificadores. El id del plato se conserva. Los ids de modificador se regeneran |
| Baja | `DeactivateMenuItem` solo pone `active: false`. La reactivación es una edición con `active: true` |
| Nombre | Se persiste el `trim`. Puede repetirse entre platos |
| Ids | Los genera la función inyectada. El dominio no llama a `crypto` |
| Repositorio | `add` inserta o lanza si el id existe. `save` reemplaza o lanza si no existe. Sin upsert |
| Orden del listado | El caso no ordena. El doble en memoria devuelve el orden del primer `add` |
| Errores | Clases con `name` propio. Mensaje fijo en inglés de código, sin SQL ni HTTP |
| Tests | Vitest ya instalado. Sin red, sin `DATABASE_URL` |

## 4. Contrato

### 4.1 Objetos

`Money.of(amount, currency)` y `TaxRate.of(basisPoints)`.

`Modifier.extra({ id, name, price })` y `Modifier.exclusion({ id, name })`.

`MenuItem.create({ id, name, price, applicableTax, modifiers })` deja `active` en `true`.

`MenuItem.restore(...)` existe para el doble y, más adelante, para el mapper. Exige las mismas reglas y acepta `active` explícito. No es un atajo que salte validaciones.

`item.deactivate()` devuelve otro `MenuItem` inactivo. Si ya lo estaba, devuelve un valor equivalente sin exigir al caso que escriba.

`item.replace({ name, price, applicableTax, active, modifiers })` conserva `id`.

Getters. Nada de campos públicos mutables. `modifiers` devuelve una copia.

### 4.2 Entrada de los casos

```ts
type CreateMenuItemCommand = {
  name: string;
  price: { amount: number; currency: string };
  applicableTax: { basisPoints: number };
  modifiers: ModifierDraft[];
};

type ModifierDraft =
  | { name: string; kind: 'extra'; price: { amount: number; currency: string } }
  | { name: string; kind: 'exclusion' };

type UpdateMenuItemCommand = {
  id: string;
  name: string;
  price: { amount: number; currency: string };
  applicableTax: { basisPoints: number };
  active: boolean;
  modifiers: ModifierDraft[];
};
```

`kind` fuera de esos dos literales no llega a construirse como borrador válido: el caso lo rechaza con `InvalidModifierKindError` antes del repositorio. Un extra sin campo `price`, o una exclusión con `price`, también, antes de `add` o `save`.

### 4.3 Puerto

```ts
interface MenuRepository {
  add(item: MenuItem): Promise<void>;
  save(item: MenuItem): Promise<void>;
  findById(id: string): Promise<MenuItem | null>;
  list(): Promise<MenuItem[]>;
}
```

El doble guarda copias. Devolver el mismo objeto que el test mutara no es aceptable: al entregar un plato, entrega un valor que el llamador no puede alterar.

### 4.4 Errores

| Clase | Quién la lanza |
|-------|----------------|
| `BlankIdError`, `BlankNameError`, `InvalidMoneyError`, `InvalidTaxRateError`, `InvalidModifierKindError`, `ExtraMissingPriceError`, `ExclusionHasPriceError` | Dominio, al construir |
| `MenuItemNotFoundError` | `save` del puerto, y los casos de editar y desactivar cuando `findById` da `null` |
| `MenuItemAlreadyExistsError` | `add` del puerto, y `CreateMenuItem` no lo traga |

Los casos no convierten esos errores en otro tipo. El test afirma la clase, no el texto del mensaje.

## 5. Capas

- **Dominio:** dinero, tasa, modificador, plato, errores de invariante.
- **Aplicación:** `MenuRepository` y cuatro casos. Constructor: repositorio y `generateId`. Sin `process.env`.
- **Doble:** implementa el puerto, solo lo construyen los specs.
- **Drizzle, HTTP, web, `AppModule`:** no participan.

## 6. Archivos

Dominio:

- `apps/api/src/domain/money/money.ts`
- `apps/api/src/domain/money/money.spec.ts`
- `apps/api/src/domain/menu/tax-rate.ts`
- `apps/api/src/domain/menu/tax-rate.spec.ts`
- `apps/api/src/domain/menu/modifier.ts`
- `apps/api/src/domain/menu/modifier.spec.ts`
- `apps/api/src/domain/menu/menu-item.ts`
- `apps/api/src/domain/menu/menu-item.spec.ts`
- `apps/api/src/domain/menu/menu-item.errors.ts`

Aplicación:

- `apps/api/src/application/ports/menu-repository.ts`
- `apps/api/src/application/menu/menu-item-repository.errors.ts`
- `apps/api/src/application/menu/create-menu-item.ts`
- `apps/api/src/application/menu/list-menu-items.ts`
- `apps/api/src/application/menu/update-menu-item.ts`
- `apps/api/src/application/menu/deactivate-menu-item.ts`
- `apps/api/src/application/menu/in-memory-menu-repository.ts`
- `apps/api/src/application/menu/create-menu-item.spec.ts`
- `apps/api/src/application/menu/list-menu-items.spec.ts`
- `apps/api/src/application/menu/update-menu-item.spec.ts`
- `apps/api/src/application/menu/deactivate-menu-item.spec.ts`

Un archivo, una preocupación. Los `index.ts` que hoy exportan `{}` pueden reexportar los tipos nuevos del dueño. No se crea una carpeta `utils/` ni `zod/`.

## 7. Orden

1. `Money` y `TaxRate` con sus specs (M1–M8, T1–T6).
2. `Modifier` y `MenuItem` con sus specs (D1–D12).
3. Puerto, errores de repositorio y doble.
4. Los cuatro casos, cada uno con su spec, contra el doble (C1–C7, L1–L3, U1–U6, X1–X5).
5. `pnpm --filter @restaurante/api test` sin `DATABASE_URL`, y `pnpm --filter @restaurante/api typecheck`.

No se avanza al paso 4 si un objeto inválido todavía se puede construir.

## 8. Catálogo de pruebas

Cada ítem es un `it`. El número es el contrato: no se fusionan dos fallos distintos en un solo test “rechaza basura”.

### Dinero y tasa

| Id | Dado | Entonces |
|----|------|----------|
| M1 | `4500`, `MXN` | `amount` 4500 y moneda `MXN` |
| M2 | monto `0`, `MXN` | válido |
| M3 | monto `2_147_483_647`, `MXN` | válido |
| M4 | monto `2_147_483_648` | `InvalidMoneyError` |
| M5 | monto `-1`, `1.5`, `NaN`, `Infinity` | `InvalidMoneyError` en cada caso |
| M6 | moneda `mxn`, `USD`, `MX`, `MXNX`, `""` | `InvalidMoneyError` en cada caso |
| T1 | `1600` | `basisPoints` 1600 |
| T2 | `0` y `2_147_483_647` | válidos |
| T3 | `-1`, `1600.5`, `NaN`, `2_147_483_648` | `InvalidTaxRateError` en cada caso |

### Modificador y plato

| Id | Dado | Entonces |
|----|------|----------|
| D1 | extra con precio `MXN` `1500` | válido, precio presente |
| D2 | extra sin precio, o extra con moneda inválida | `ExtraMissingPriceError` o `InvalidMoneyError`, y no hay objeto |
| D3 | exclusión sin precio | válido, sin precio |
| D4 | exclusión con precio `0` | `ExclusionHasPriceError` |
| D5 | nombre de plato `"  Tacos  "` y lista vacía | nombre `"Tacos"`, activo, cero modificadores |
| D6 | nombre `"   "` o `""` | `BlankNameError` |
| D7 | id `"  "` | `BlankIdError` |
| D8 | extra y exclusión juntos | los dos quedan, en ese orden |
| D9 | el llamador hace `push` sobre el arreglo devuelto | el plato sigue con la cantidad original |
| D10 | `deactivate` de un activo | otro valor, `active === false`, mismo id, mismos modificadores |
| D11 | `deactivate` de un inactivo | sigue inactivo, mismos datos |
| D12 | `replace` con otros modificadores y `active: true` | mismo id de plato, ids de modificador distintos, datos nuevos |
| D13 | `restore` con `active: false` y datos válidos | inactivo y válido |
| D14 | `restore` con extra sin precio | el mismo error que al crear, no un plato a medias |

D12 usa dos ids de modificador distintos que el test pasa al `replace` a través de la construcción directa. El caso de uso que regenera ids se prueba en U4.

### Crear

| Id | Dado | Entonces |
|----|------|----------|
| C1 | nombre, precio, tasa, un extra y una exclusión. Ids prefijados `item-1`, `mod-1`, `mod-2` | `add` una vez. Activo. Precio y tasa iguales. Extra con precio. Exclusión sin precio |
| C2 | sin modificadores | `modifiers` vacío, `add` una vez |
| C3 | nombre en blanco, monto `1.5`, tasa negativa, extra sin precio, exclusión con precio, `kind` ilegible | en cada subcaso el error de la sección 4.4 y **cero** llamadas a `add` |
| C4 | el generador repite `item-1` y ese id ya está | `MenuItemAlreadyExistsError`. El plato original sigue igual |
| C5 | precio `0` y tasa `0` y extra de monto `0` | `add` correcto |
| C6 | dos platos con el mismo nombre y distinto id | los dos quedan |
| C7 | el spec muta el arreglo de modificadores del resultado | un `findById` sigue mostrando la lista guardada |

### Listar

| Id | Dado | Entonces |
|----|------|----------|
| L1 | repositorio vacío | `[]` |
| L2 | un activo y un inactivo, insertados en ese orden | los dos, activo primero, sin filtrar |
| L3 | después de un `save` que cambia el nombre | el listado sigue en la posición del `add`, con el nombre nuevo |

### Editar

| Id | Dado | Entonces |
|----|------|----------|
| U1 | id inexistente | `MenuItemNotFoundError`, cero `save` |
| U2 | cambio de nombre, precio, tasa y modificadores | mismo id de plato, `save` con los datos nuevos |
| U3 | comando inválido sobre un id que sí existe | error de dominio, el plato guardado no cambia |
| U4 | la lista nueva trae otros modificadores | los ids de modificador no coinciden con los anteriores. El orden es el del comando |
| U5 | `active: true` sobre un inactivo | queda activo, `save` una vez |
| U6 | `active: false` | queda inactivo. Sigue siendo una edición: los modificadores del comando reemplazan a los viejos |

### Desactivar

| Id | Dado | Entonces |
|----|------|----------|
| X1 | id inexistente | `MenuItemNotFoundError`, cero `save` |
| X2 | plato activo con extra y exclusión | `active === false`, mismo id, mismos modificadores, `save` una vez |
| X3 | ejecutar otra vez sobre el resultado | el segundo resultado sigue inactivo y el doble **no** recibe un segundo `save` |
| X4 | plato que ya se guardó inactivo vía `restore` en el doble | no llama a `save` |
| X5 | después de desactivar, `list` lo incluye | sigue en la lista |

### Red de seguridad del núcleo

| Id | Entonces |
|----|----------|
| R1 | En `src/domain` y en los cuatro casos no hay import de `@nestjs/*`, `drizzle-orm`, `postgres`, `zod` ni de `infrastructure/` |
| R2 | `env -u DATABASE_URL pnpm --filter @restaurante/api test` pasa, incluidos los tests viejos de health |
| R3 | `pnpm --filter @restaurante/api typecheck` pasa |
| R4 | `AppModule` no menciona `MenuRepository` ni los casos nuevos |

R1 se cubre con revisión del diff de imports, no con un test que parsee el disco, salvo que el typecheck ya falle por un import cruzado.

## 9. Qué no demuestra esta tarea

- Que Drizzle guarde el plato y lo recupere al reiniciar. Eso es la tarea de persistencia y API.
- Que `POST` o `PATCH` respondan 404 o 422. No hay endpoints.
- Que la pantalla muestre vacío o error. No hay UI.
- El frente de sistema de `docs/desarrollo/pruebas-cttm.md` (home, `pnpm dev`). No cambia el comportamiento visible. No se reescribe esa guía en este plan.

## 10. Hecho cuando

- [x] M1–M6, T1–T3, D1–D14 pasan
- [x] C1–C7, L1–L3, U1–U6, X1–X5 pasan
- [x] R2, R3 y R4 se cumplen
- [x] Un plato inválido no produce fila en el doble
- [x] No hay archivos nuevos de HTTP, Drizzle ni web
- [x] Este documento tiene, al cerrar, la fecha y el resultado (pasó o falló) de R2 y R3

Al cerrar la implementación se anota aquí el comando y el número de tests. Los huecos no se dejan solo en el chat.

## 11. Cierre — 30 de septiembre de 2026

| Prueba | Comando | Resultado |
|--------|---------|-----------|
| R1 | Revisión de imports en `src/domain` y en los cuatro casos | Pasó. Sin `@nestjs/*`, `drizzle-orm`, `postgres`, `zod` ni `infrastructure/` |
| R2 | `env -u DATABASE_URL pnpm --filter @restaurante/api test` | Pasó. 11 archivos, 49 pruebas, incluidos health |
| R3 | `pnpm --filter @restaurante/api typecheck` | Pasó |
| R4 | Revisión de `AppModule` | Pasó. No menciona `MenuRepository` ni los casos nuevos |

No se agregaron archivos de HTTP, Drizzle ni web. Un comando inválido no llama a `add` ni a `save` (C3, U3).

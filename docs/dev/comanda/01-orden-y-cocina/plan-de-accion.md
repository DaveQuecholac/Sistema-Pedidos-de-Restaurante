# Plan de acción — Tarea 1 · Orden, líneas y cocina en el núcleo (E2 + E3)

**Rama:** `dev/comanda`  
**Sprint:** 2 (RF2–RF3). Tarea 1 de 3. Solo esta.  
**Fecha:** 4 de octubre de 2026  
**Estado:** cerrado. Implementación anotada el 4 de octubre de 2026.  
**Análisis:** `analisis.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Resultado

Con Vitest y sin Postgres se puede abrir una orden por mesa o por id externo, agregar, modificar y cancelar líneas con platos del menú, enviarla a cocina, marcarla lista y cancelarla. Una orden en cocina rechaza cualquier edición de líneas. Dos operaciones que leen la misma versión no pueden guardarse las dos.

## 2. No se toca

- `apps/api/src/domain/menu/**`, `domain/money/**` y los casos de menú. Se importan; no se modifican.
- `InMemoryMenuRepository`. Los specs de orden lo usan tal cual.
- `app.module.ts`, `main.ts`, `infrastructure/**`, `interface/**`, migraciones.
- `apps/web/**`.
- Totales, propina, descuento, cobro, cierre.

Si al implementar hace falta un archivo fuera de la sección 6, se lista y se acuerda antes de seguir.

## 3. Decisiones cerradas para implementar

Valen las decisiones confirmadas en la sección 11 del análisis.

| Tema | Decisión |
|------|----------|
| Origen | `OrderOrigin.table(tableId)` u `OrderOrigin.external(externalOrderId)`. Recortado. 1–40 y 1–64 caracteres |
| Cantidad | `Quantity.of(n)`: entero 1–99 |
| Línea | Copia `menuItemId`, nombre, `Money` unitario, `TaxRate` y modificadores elegidos. No suma |
| Orden de modificadores en la línea | El del plato, no el del comando |
| Estado | Objetos State por estatus. `Order` delega `canEditLines`, `startCooking`, `markReady`, `cancel` |
| `allowedActions()` | Subconjunto ordenado de `editLines`, `startCooking`, `markReady`, `cancel` |
| `startCooking` sin líneas | `EmptyOrderError`. `allowedActions` no incluye `startCooking` |
| Cancelar línea | La quita. Solo en `OPEN` |
| Modificar línea | Recaptura de la carta actual, conserva `lineId` y posición |
| Versión | La lleva `Order`. El dominio no la cambia. El repositorio compara y escribe `+1` |
| Ids | `generateId` inyectado. Orden y línea. El dominio no llama a `crypto` |
| Reloj | `now` inyectado en `OpenOrder`. El dominio no llama a `new Date()` |
| Mesa | **Vigente (mesas, 10 oct 2026):** una orden activa por mesa; catálogo + activa. *(Antes en este plan: varias vivas — obsoleto.)* |
| Externo | Único para siempre: `ExternalOrderIdInUseError` |
| Errores | Clases con `name` propio, mensaje fijo en inglés, sin HTTP ni SQL |

## 4. Contrato

### 4.1 Dominio

```ts
type OrderStatus = 'OPEN' | 'IN_KITCHEN' | 'READY' | 'CLOSED' | 'CANCELLED';
type OrderAction = 'editLines' | 'startCooking' | 'markReady' | 'cancel';

class OrderOrigin {
  static table(tableId: string): OrderOrigin;
  static external(externalOrderId: string): OrderOrigin;
  get tableId(): string | null;
  get externalOrderId(): string | null;
}

class LineItem {
  static capture(input: {
    id: string;
    menuItem: MenuItem;
    quantity: Quantity;
    modifierIds: readonly string[];
  }): LineItem;
  static restore(input: { /* campos guardados, mismas reglas */ }): LineItem;
  recapture(input: { menuItem: MenuItem; quantity: Quantity; modifierIds: readonly string[] }): LineItem;
  // getters: id, menuItemId, name, unitPrice, applicableTax, quantity, modifiers
}

class Order {
  static open(input: { id: string; origin: OrderOrigin; openedAt: Date }): Order; // OPEN, sin líneas, version 0
  static restore(input: { id; origin; status; openedAt; lines; version }): Order;
  addLine(line: LineItem): Order;
  replaceLine(line: LineItem): Order;   // mismo id, misma posición
  cancelLine(lineId: string): Order;
  startCooking(): Order;
  markReady(): Order;
  cancel(): Order;
  allowedActions(): OrderAction[];
  // getters: id, origin, status, openedAt, lines (copia), version
}
```

`LineItem.capture` aplica las reglas de la sección 5.2 del análisis contra el `MenuItem` que recibe. No consulta ningún repositorio.

`Order.restore` existe para el doble y, en la tarea 2, para el mapper. Exige las mismas invariantes: estado válido, ids no vacíos, ids de línea sin repetir. No es un atajo que salte validaciones.

### 4.2 Puerto

```ts
interface OrderRepository {
  add(order: Order): Promise<void>;                        // OrderAlreadyExistsError
  save(order: Order): Promise<void>;                       // OrderNotFoundError | OrderConcurrencyError
  findById(id: string): Promise<Order | null>;
  findByExternalOrderId(externalOrderId: string): Promise<Order | null>;
  list(filter: { statuses: readonly OrderStatus[] | null }): Promise<Order[]>; // openedAt asc, id asc
}
```

`save` compara `order.version` con la guardada. Si coincide, guarda con `version + 1`. Si no, `OrderConcurrencyError` y no toca nada. El doble entrega copias: lo que devuelve no altera lo guardado.

### 4.3 Comandos

```ts
type OpenOrderCommand =
  | { tableId: string; externalOrderId?: undefined }
  | { externalOrderId: string; tableId?: undefined };
type AddLineCommand = { orderId: string; menuItemId: string; quantity: number; modifierIds: string[] };
type ModifyLineCommand = { orderId: string; lineId: string; quantity: number; modifierIds: string[] };
type CancelLineCommand = { orderId: string; lineId: string };
type OrderIdCommand = { orderId: string };          // GetOrder, StartCooking, MarkOrderReady, CancelOrder
type ListOrdersQuery = { statuses: OrderStatus[] | null };
```

El tipo de TypeScript no basta: `OpenOrder` comprueba en ejecución que venga exactamente uno, porque la tarea 2 le pasará lo que mande HTTP.

## 5. Capas

- **Dominio:** origen, cantidad, modificador de línea, línea, estados, orden, errores de dominio.
- **Aplicación:** puerto, errores de aplicación, nueve casos, doble en memoria. Constructor: repositorios, `generateId`, `now`.
- **Doble:** implementa `OrderRepository`. Solo lo construyen los specs (y, en la tarea 2, el spec HTTP).
- **Drizzle, HTTP, web, `AppModule`:** no participan.

## 6. Archivos

Dominio (`apps/api/src/domain/order/`):

- `order-origin.ts` · `order-origin.spec.ts`
- `quantity.ts` · `quantity.spec.ts`
- `line-item.ts` · `line-item.spec.ts` (incluye `LineModifier`)
- `order-status.ts` · `order-status.spec.ts` (los objetos State)
- `order.ts` · `order.spec.ts`
- `order.errors.ts`
- `index.ts` (reexporta)

Aplicación:

- `apps/api/src/application/ports/order-repository.ts`
- `apps/api/src/application/ports/index.ts` (reexporta el puerto)
- `apps/api/src/application/order/order-repository.errors.ts`
- `apps/api/src/application/order/in-memory-order-repository.ts`
- `apps/api/src/application/order/in-memory-order-repository.spec.ts`
- `open-order.ts`, `get-order.ts`, `list-orders.ts`, `add-line.ts`, `modify-line.ts`, `cancel-line.ts`, `start-cooking.ts`, `mark-order-ready.ts`, `cancel-order.ts`, cada uno con su `.spec.ts`
- `apps/api/src/application/order/order-test-fixtures.ts` (platos de prueba armados con `MenuItem.create`; solo lo importan specs)

Un archivo, una preocupación. Sin `utils/`.

## 7. Pasos

Cada paso termina con `env -u DATABASE_URL pnpm --filter @restaurante/api test` y `pnpm --filter @restaurante/api typecheck` en verde. No se pasa al siguiente con un rojo.

### Paso 1 — Origen y cantidad

`OrderOrigin`, `Quantity` y sus errores. Pruebas O1–O7 y Q1–Q4.

**Prueba de error:** cada rechazo es un `it` propio. No se valida un origen con `as any` que el tipo prohibiría: se usa el valor que mandaría HTTP (`undefined`, `""`, ambos campos).

### Paso 2 — Línea

`LineModifier` y `LineItem.capture` / `recapture` / `restore`. Pruebas LI1–LI12.

**Prueba de error:** la línea se construye con un `MenuItem` real (`MenuItem.create`), no con un objeto a mano. Así, si el menú cambia de forma, el spec se rompe aquí y no en la demo.

### Paso 3 — Estados

`order-status.ts`: un objeto por estatus con `canEditLines`, `next(action)`, `allowedActions(lineCount)`. Pruebas S1–S8: la tabla de la sección 5.3 del análisis, celda por celda.

**Prueba de error:** S8 recorre las 5 × 4 combinaciones de estado y acción y compara contra una tabla escrita en el spec. Si alguien agrega una transición sin actualizar el análisis, falla.

### Paso 4 — Agregado

`Order.open`, `restore`, operaciones y `allowedActions`. Pruebas OR1–OR16.

No se avanza si una `Order` en `IN_KITCHEN` puede producir otra con líneas distintas.

### Paso 5 — Puerto y doble

Puerto, `OrderNotFoundError`, `OrderAlreadyExistsError`, `OrderConcurrencyError`, `ExternalOrderIdInUseError`, doble con versión. Pruebas RP1–RP8.

### Paso 6 — Casos de uso

En este orden, cada uno con su spec: `OpenOrder`, `GetOrder`, `ListOrders`, `AddLine`, `ModifyLine`, `CancelLine`, `StartCooking`, `MarkOrderReady`, `CancelOrder`. Pruebas de la sección 8.

Cada spec usa un doble espía (envuelve al doble y cuenta `add` y `save`) para afirmar que un error no escribe.

### Paso 7 — Red de seguridad

R1–R5. Se anota el resultado en la sección 11.

## 8. Catálogo de pruebas

Cada fila es un `it`. El id es el contrato: no se juntan dos fallos distintos en un test «rechaza basura».

Platos de prueba (fixture): **Tacos** activo, `4500` MXN, tasa `1600`, ingredientes tortilla, suadero, cilantro; extra `Queso` `1500`; omitir `Cilantro`. **Flan** inactivo, `3500`, sin modificadores.

### Origen y cantidad

| Id | Dado | Entonces |
|----|------|----------|
| O1 | `table("  5 ")` | `tableId` `"5"`, `externalOrderId` `null` |
| O2 | `external("UBER-123")` | `externalOrderId` `"UBER-123"`, `tableId` `null` |
| O3 | `table("")`, `table("   ")` | `InvalidTableIdError` |
| O4 | `table` de 41 caracteres; de 40 | error; válido |
| O5 | `external("")`; de 65; de 64 | error; error; válido |
| O6 | Los dos campos a la vez (vía `OpenOrder`) | `InvalidOrderOriginError` |
| O7 | Ninguno (vía `OpenOrder`) | `InvalidOrderOriginError` |
| Q1 | `1` y `99` | válidos |
| Q2 | `0`, `100`, `-1` | `InvalidQuantityError` |
| Q3 | `1.5`, `NaN`, `Infinity` | `InvalidQuantityError` |
| Q4 | `"2"` (string que llegara sin tipo) | `InvalidQuantityError` |

### Línea

| Id | Dado | Entonces |
|----|------|----------|
| LI1 | Tacos, cantidad 2, sin modificadores | `menuItemId`, nombre `Tacos`, precio `4500` MXN, tasa `1600`, cantidad 2, `[]` |
| LI2 | Tacos con `Queso` | un modificador `extra`, nombre `Queso`, precio `1500` |
| LI3 | Tacos con omitir `Cilantro` | un modificador `exclusion`, precio `null` |
| LI4 | Tacos con omitir y extra, en ese orden de ids | sale primero el que va primero en el plato |
| LI5 | Flan (inactivo) | `MenuItemUnavailableError` |
| LI6 | Id de modificador de otro plato | `UnknownModifierError` |
| LI7 | Id inventado | `UnknownModifierError` |
| LI8 | El mismo id dos veces | `DuplicateModifierSelectionError` |
| LI9 | Tras capturar, se edita el plato (precio `5000`) y se desactiva | la línea sigue con `4500` y su modificador |
| LI10 | El llamador hace `push` en `modifiers` | la línea no cambia |
| LI11 | `recapture` con otra cantidad y otro modificador | mismo `id`, datos nuevos |
| LI12 | `restore` con modificador `exclusion` y precio | mismo error que en el menú (`ExclusionHasPriceError`), sin línea a medias |

### Estados

| Id | Dado | Entonces |
|----|------|----------|
| S1 | `OPEN` | `canEditLines` verdadero |
| S2 | `IN_KITCHEN`, `READY`, `CLOSED`, `CANCELLED` | `canEditLines` falso en cada uno |
| S3 | `OPEN` + `startCooking` | `IN_KITCHEN` |
| S4 | `IN_KITCHEN` + `markReady` | `READY` |
| S5 | `OPEN` + `cancel`, `IN_KITCHEN` + `cancel` | `CANCELLED` |
| S6 | `READY` + `cancel` | `InvalidOrderTransitionError` |
| S7 | `CLOSED` y `CANCELLED` + cualquier acción | `InvalidOrderTransitionError` |
| S8 | Las 20 combinaciones estado × acción | coinciden con la tabla del spec |

### Agregado

| Id | Dado | Entonces |
|----|------|----------|
| OR1 | `open` con mesa | `OPEN`, sin líneas, `version` 0, `openedAt` el recibido |
| OR2 | `addLine` dos veces | dos líneas en ese orden |
| OR3 | `addLine` con un id de línea repetido | error, la orden no cambia |
| OR4 | `replaceLine` de la segunda | queda en la segunda posición |
| OR5 | `replaceLine` / `cancelLine` de un id ausente | `LineItemNotFoundError` |
| OR6 | `cancelLine` de la única línea | orden `OPEN` sin líneas |
| OR7 | `startCooking` sin líneas | `EmptyOrderError` |
| OR8 | `startCooking` con una línea | `IN_KITCHEN`, mismas líneas |
| OR9 | En `IN_KITCHEN`: `addLine`, `replaceLine`, `cancelLine` | `OrderNotEditableError` en cada una |
| OR10 | En `READY` y en `CANCELLED`: las tres | `OrderNotEditableError` |
| OR11 | `markReady` desde `OPEN` | `InvalidOrderTransitionError` |
| OR12 | `cancel` desde `IN_KITCHEN` | `CANCELLED`, líneas intactas |
| OR13 | `allowedActions` de `OPEN` vacía / con líneas | `[editLines, cancel]` / `[editLines, startCooking, cancel]` |
| OR14 | `allowedActions` de `IN_KITCHEN`, `READY`, `CANCELLED` | `[markReady, cancel]`, `[]`, `[]` |
| OR15 | Ninguna operación cambia `version` | igual a la de entrada |
| OR16 | `restore` con estado `"COOKING"` o ids de línea repetidos | error, sin orden |

### Repositorio en memoria

| Id | Dado | Entonces |
|----|------|----------|
| RP1 | `add` y `findById` | copia equivalente, `version` 0 |
| RP2 | `add` con id repetido | `OrderAlreadyExistsError` |
| RP3 | `save` con la versión leída | guarda, la siguiente lectura trae `version` 1 |
| RP4 | Dos lecturas, `save` de la primera, `save` de la segunda | la segunda lanza `OrderConcurrencyError`; queda lo de la primera |
| RP5 | `save` de un id ausente | `OrderNotFoundError` |
| RP6 | `findByExternalOrderId` con una orden `CANCELLED` de ese id | la devuelve (cuenta como usado) |
| RP7 | `list` con filtro `[IN_KITCHEN]` | solo esas, por `openedAt` y luego id |
| RP8 | El llamador muta lo que devolvió `list` | lo guardado no cambia |

### Casos de uso

| Id | Caso | Dado | Entonces |
|----|------|------|----------|
| C1 | `OpenOrder` | mesa `"5"` libre | `OPEN`, id de `generateId`, `openedAt` de `now`, un `add` |
| C2 | `OpenOrder` | externo `"UBER-1"` | mismo flujo, origen externo |
| C3 | `OpenOrder` | mesa `"5"` con una orden activa | `TableAlreadyHasActiveOrderError`, cero `add` *(antes, 4 oct: abrir tercera; sustituido por módulo mesas)* |
| C4 | `OpenOrder` | externo `"UBER-1"` ya usado por una `OPEN` | `ExternalOrderIdInUseError`, cero `add` |
| C5 | `OpenOrder` | externo `"UBER-1"` ya usado por una `CANCELLED` | `ExternalOrderIdInUseError`, cero `add` |
| C6 | `OpenOrder` | ambos campos, ninguno, mesa en blanco | error de la sección 8 del análisis y cero `add` |
| C7 | `GetOrder` | id ausente | `OrderNotFoundError` |
| C8 | `ListOrders` | `null` y `[OPEN, IN_KITCHEN]` | todas / filtradas, en orden |
| A1 | `AddLine` | Tacos ×2 con `Queso` en `OPEN` | una línea, un `save`, la orden devuelta la trae |
| A2 | `AddLine` | orden ausente | `OrderNotFoundError`, cero `save` |
| A3 | `AddLine` | orden `IN_KITCHEN` y plato inexistente | `OrderNotEditableError` (el estado se valida antes) |
| A4 | `AddLine` | plato inexistente en `OPEN` | `MenuItemNotFoundError`, cero `save` |
| A5 | `AddLine` | Flan inactivo | `MenuItemUnavailableError`, cero `save` |
| A6 | `AddLine` | cantidad `0`, modificador ajeno, modificador repetido | el error de cada uno, cero `save` |
| A7 | `AddLine` | otro `save` ocurrió entre la lectura y la escritura | `OrderConcurrencyError`, la línea no queda |
| A8 | `AddLine` | `StartCooking` se guardó entre la lectura y la escritura | `OrderConcurrencyError`; la orden sigue `IN_KITCHEN` y sin la línea (caso de la sección 7 del análisis) |
| M1 | `ModifyLine` | cantidad 3 y omitir `Cilantro` | mismo `lineId` y posición, datos nuevos, un `save` |
| M2 | `ModifyLine` | el plato cambió a `5000` desde que se agregó | la línea pasa a `5000` |
| M3 | `ModifyLine` | el plato se desactivó | `MenuItemUnavailableError`; la línea vieja sigue igual |
| M4 | `ModifyLine` | `lineId` ausente | `LineItemNotFoundError`, cero `save` |
| M5 | `ModifyLine` | orden `IN_KITCHEN` | `OrderNotEditableError`, cero `save` |
| K1 | `CancelLine` | línea existente en `OPEN` | se quita, un `save` |
| K2 | `CancelLine` | `IN_KITCHEN` | `OrderNotEditableError` |
| K3 | `CancelLine` | `lineId` ausente | `LineItemNotFoundError` |
| SC1 | `StartCooking` | `OPEN` con líneas | `IN_KITCHEN`, un `save` |
| SC2 | `StartCooking` | `OPEN` vacía | `EmptyOrderError`, cero `save` |
| SC3 | `StartCooking` | ya `IN_KITCHEN` | `InvalidOrderTransitionError`, cero `save` |
| SC4 | `StartCooking` y luego `AddLine` | — | `OrderNotEditableError` |
| MR1 | `MarkOrderReady` | `IN_KITCHEN` | `READY` |
| MR2 | `MarkOrderReady` | `OPEN` | `InvalidOrderTransitionError` |
| X1 | `CancelOrder` | `OPEN` y `IN_KITCHEN` | `CANCELLED`, líneas intactas |
| X2 | `CancelOrder` | `READY` y `CANCELLED` | `InvalidOrderTransitionError`, cero `save` |
| X3 | `CancelOrder` de una externa y luego `OpenOrder` con el mismo `externalOrderId` | — | `ExternalOrderIdInUseError` |

### Red de seguridad

| Id | Entonces |
|----|----------|
| R1 | `src/domain/order` y `src/application/order` no importan `@nestjs/*`, `drizzle-orm`, `postgres`, `zod` ni `infrastructure/` |
| R2 | `env -u DATABASE_URL pnpm --filter @restaurante/api test` pasa, con los tests del menú y health intactos |
| R3 | `pnpm --filter @restaurante/api typecheck` pasa |
| R4 | `AppModule` no menciona órdenes |
| R5 | `git diff` no toca `domain/menu`, `domain/money`, `application/menu` |

R1 se revisa con `rg` sobre esas carpetas; el resultado esperado es vacío.

```bash
rg "@nestjs|drizzle-orm|from 'postgres'|from 'zod'|infrastructure/" apps/api/src/domain/order apps/api/src/application/order
```

## 9. Qué no demuestra esta tarea

- Que una orden sobreviva un reinicio. Es la tarea 2.
- Que HTTP responda 409 al editar en cocina. Es la tarea 2.
- Que la pantalla bloquee. Es la tarea 3.
- Totales. Es el Sprint 3.

## 10. Hecho cuando

- [x] O1–O7, Q1–Q4, LI1–LI12, S1–S8, OR1–OR16 pasan
- [x] RP1–RP8 pasan
- [x] C1–C8, A1–A8, M1–M5, K1–K3, SC1–SC4, MR1–MR2, X1–X3 pasan
- [x] R1–R5 se cumplen
- [x] Ningún caso escribe cuando el agregado lanza
- [x] Este documento tiene, al cerrar, fecha, comando y número de pruebas

## 11. Cierre — 4 de octubre de 2026

| Prueba | Comando | Resultado |
|--------|---------|-----------|
| R1 | `rg "@nestjs\|drizzle-orm\|from 'postgres'\|from 'zod'\|infrastructure/" apps/api/src/domain/order apps/api/src/application/order` | Pasó. Sin coincidencias |
| R2 | `env -u DATABASE_URL pnpm --filter @restaurante/api test` | Pasó. 27 archivos, 177 pruebas (8 skipped: integración menú). Incluye health y menú |
| R3 | `pnpm --filter @restaurante/api typecheck` | Pasó |
| R4 | Revisión de `AppModule` | Pasó. No menciona órdenes ni `OrderRepository` |
| R5 | `git diff --name-only -- apps/api/src/domain/menu apps/api/src/domain/money apps/api/src/application/menu` | Pasó. Sin cambios |

No se agregaron archivos de HTTP, Drizzle ni web. `AppModule` y `main.ts` no cambiaron. Un comando inválido no llama a `add` ni a `save` (specs con doble espía).

Siguiente tarea del sprint: `docs/dev/comanda/02-persistencia-y-api/`.

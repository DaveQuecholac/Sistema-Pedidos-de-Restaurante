# Análisis — Tarea 1 · Orden, líneas y cocina en el núcleo (E2 + E3)

**Rama:** `dev/comanda`  
**Sprint:** 2 (RF2–RF3). Tarea 1 de 3. Solo esta.  
**Fecha:** 4 de octubre de 2026  
**Estado:** acordado el 4 de octubre de 2026 (sección 11). No cambia código.  
**Plan:** `plan-de-accion.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Mapa del sprint

El Sprint 2 se demuestra así: abrir una orden, armarla con el menú del Sprint 1, enviarla a cocina e intentar editarla para ver que está bloqueada. Se parte en tres tareas, igual que el menú:

| Tarea | Carpeta | Entrega | Se prueba con |
|-------|---------|---------|---------------|
| 1 | `01-orden-y-cocina/` | Agregado `Order`, estados, líneas, casos de uso, repositorio en memoria | Vitest, sin Postgres ni navegador |
| 2 | `02-persistencia-y-api/` | Tablas Drizzle, `DrizzleOrderRepository`, REST de órdenes y cocina | Vitest + Postgres en transacción + `curl` |
| 3 | `03-pantalla-comanda-y-demo/` | Pantallas de comandas, detalle de orden y cocina, con el estilo del menú | Vitest de funciones puras + recorrido en navegador |

Esta tarea define el contrato que las otras dos tienen que cumplir sin cambiar reglas. Si la tarea 2 o la 3 necesita otra regla, se para y se vuelve a este análisis.

## 2. Qué pide la tarea

RF2: abrir una comanda ligada a una mesa o a un id de pedido externo.  
RF3: agregar, modificar o cancelar líneas validando el estado de la cocina. No se edita después de iniciar la cocción.

Tarjetas de Trello que cubre: «Ciclo de vida de la orden», «Regla: no editar líneas cuando está en cocción», «Abrir orden», y la parte de núcleo de «Agregar, modificar y cancelar líneas + enviar a cocina».

## 3. Qué ya existe

| Ya existe | No existe |
|-----------|-----------|
| `Money` (centavos enteros, solo `MXN`, tope int4) y `TaxRate` (puntos base) | Cualquier cosa de orden: `domain/order/index.ts` exporta `{}` |
| `MenuItem` con ingredientes, extras y omitir; `active` | `OrderRepository` |
| Puerto `MenuRepository` con `findById` | Casos de uso de orden |
| `InMemoryMenuRepository` para specs | Errores de orden |
| Patrón de errores: clase con `name` propio y mensaje fijo en inglés | |

Dos hechos del menú pesan en el diseño de la línea:

1. **Los ids de modificador cambian al editar un plato.** `UpdateMenuItem` regenera todos los ids y `DrizzleMenuRepository.save` borra las filas hijas e inserta nuevas. Una línea que guardara solo el id del modificador perdería su referencia en cuanto alguien corrija la carta. Por eso la línea **copia** nombre, tipo y precio del modificador al momento de agregarse.
2. **Un plato no se borra, se desactiva.** El id de `MenuItem` es estable. La línea sí puede guardar `menuItemId` como referencia, además de su copia de nombre, precio y tasa.

## 4. Alcance

Entra:

- Value objects del origen y de la cantidad.
- `LineItem` con precios capturados.
- Agregado `Order` con State.
- Puerto `OrderRepository` y doble en memoria con control de versión.
- Casos: `OpenOrder`, `GetOrder`, `ListOrders`, `AddLine`, `ModifyLine`, `CancelLine`, `StartCooking`, `MarkOrderReady`, `CancelOrder`.
- Pruebas de dominio y de casos de uso con Vitest, sin `DATABASE_URL`.

No entra:

- Drizzle, migraciones, mapper, Zod, controllers, `AppModule`. Es la tarea 2.
- `apps/web`. Es la tarea 3.
- Subtotal, total, impuesto de la cuenta, propina, descuento (RF4, Sprint 3). La línea guarda precio y tasa, pero **no suma nada**.
- Cerrar y cobrar (RF5, Sprint 4). El estado `CLOSED` existe en el tipo, pero ninguna operación lleva a él todavía.
- Cambios al menú. Si algo del menú estorba, se anota; no se arregla de paso.
- Catálogo de mesas, login, notas libres por línea, juntar líneas iguales, eventos en vivo para cocina.

## 5. Modelo

Nombres de código en inglés. En producto se dice comanda, mesa, línea, cocina.

| Tipo | Rol |
|------|-----|
| `OrderOrigin` | Mesa (`tableId`) o pedido externo (`externalOrderId`). Exactamente uno |
| `Quantity` | Entero de 1 a 99 |
| `LineModifier` | Copia de un modificador elegido: id de origen, nombre, `extra` o `exclusion`, precio o `null` |
| `LineItem` | Id, `menuItemId`, nombre del plato, precio unitario (`Money`), tasa (`TaxRate`), cantidad, modificadores elegidos |
| `OrderStatus` | `OPEN`, `IN_KITCHEN`, `READY`, `CLOSED`, `CANCELLED` |
| `Order` | Id, origen, estado, `openedAt`, líneas, `version` |

Inmutables, como el menú. Cada operación devuelve otra `Order`. Las listas que salen del objeto son copias.

### 5.1 Origen

- `tableId`: texto. Se recorta. No puede quedar vacío. Máximo 40 caracteres. Ejemplos: `"5"`, `"Terraza 2"`. No hay catálogo de mesas: la mesa es un dato del canal.
- `externalOrderId`: texto. Se recorta. No puede quedar vacío. Máximo 64 caracteres.
- Los dos a la vez, o ninguno, es un error. El caso de uso es uno solo (`OpenOrder`). El origen no cambia ninguna otra regla.
- El origen no se edita después de abrir.

### 5.2 Línea

La línea captura lo que el cliente pidió **tal como estaba en la carta** al agregarla o modificarla:

- `menuItemId` del plato y su nombre.
- Precio unitario del plato y su tasa.
- Modificadores elegidos, en el orden en que aparecen en el plato. Cada uno con nombre, tipo y precio copiados.
- Cantidad.

Reglas al construirla:

- El plato tiene que existir y estar activo.
- Cada modificador elegido tiene que pertenecer a ese plato, buscado por su id **actual** en la carta.
- No se puede elegir dos veces el mismo modificador.
- Cero modificadores es válido.
- Dos líneas del mismo plato con las mismas elecciones son dos líneas. No se juntan.

Si después alguien cambia el precio del plato o lo desactiva, las líneas ya capturadas no cambian.

### 5.3 Estados (State)

```text
OPEN ──startCooking──► IN_KITCHEN ──markReady──► READY ──(Sprint 4: close)──► CLOSED
  │                        │
  └────────cancel──────────┴──► CANCELLED
```

Cada estado es un objeto que responde qué permite. No hay `if (status === …)` repartidos por los casos de uso.

| Estado | Editar líneas | `startCooking` | `markReady` | `cancel` |
|--------|---------------|----------------|-------------|----------|
| `OPEN` | Sí | Sí, con al menos una línea | No | Sí |
| `IN_KITCHEN` | **No** | No | Sí | Sí |
| `READY` | No | No | No | No |
| `CLOSED` | No | No | No | No |
| `CANCELLED` | No | No | No | No |

- Editar líneas = agregar, modificar o cancelar una línea. La regla de RF3 es la columna «Editar líneas».
- Enviar a cocina una orden vacía es un error: la cocina no puede preparar nada.
- `READY` espera cobro. `CLOSED` llega en el Sprint 4.
- `CANCELLED` conserva sus líneas como estaban. No se borran.

El agregado expone `allowedActions()`: una lista de `editLines`, `startCooking`, `markReady`, `cancel`, según el estado y el número de líneas. La API la devuelve y la pantalla la usa para habilitar botones. Así la UI no repite la regla de cocina.

### 5.4 Cancelar una línea

En `OPEN`, cancelar una línea la **quita** de la orden. Todavía no salió a cocina; no hay nada que conservar. En cualquier otro estado, cancelar una línea falla igual que editarla.

### 5.5 Modificar una línea

`ModifyLine` recibe la cantidad y la lista de modificadores elegidos (ids actuales de la carta). Vuelve a leer el plato y **recaptura** la línea: precio, tasa, nombre y modificadores salen de la carta de ese momento. El id de la línea no cambia.

Consecuencia: mientras la orden está en `OPEN`, el precio de la línea es el de la última vez que se tocó. Al pasar a cocina queda congelado. Si el plato se desactivó entre que se agregó y se modifica la línea, modificarla falla; la línea vieja sigue como estaba y se puede cancelar.

## 6. Unicidad del origen

**Mesa:** una mesa puede tener varias comandas vivas a la vez (por ejemplo, cuentas separadas). Abrir otra en la misma mesa no es un error. Cada comanda se distingue por su id y por la hora en que se abrió (`openedAt`). No hay consulta de «mesa ocupada».

**Pedido externo:** un `externalOrderId` identifica un pedido del canal. No se repite nunca, aunque la orden anterior esté cancelada: si el canal manda el mismo id otra vez, es un duplicado y responde `ExternalOrderIdInUseError`.

Dónde vive: `OpenOrder` consulta `findByExternalOrderId` antes de crear. La tarea 2 añade el respaldo en la base (único sobre `external_order_id`) para dos aperturas simultáneas, y traduce esa violación al mismo error.

Decisiones confirmadas por Hector el 4 de octubre de 2026 (sección 11).

## 7. Concurrencia y la regla de cocina

Sin control, esta secuencia rompe RF3:

1. Mesero A pide `AddLine`. El caso lee la orden en `OPEN`.
2. Mesero B pide `StartCooking`. Se guarda `IN_KITCHEN`.
3. El caso de A guarda la orden que leyó, con la línea nueva y el estado `OPEN`. La cocina pierde el envío.

Por eso la orden lleva `version`. `save` exige que la versión guardada sea la que se leyó y escribe la siguiente. Si no coincide, `OrderConcurrencyError` y no se escribe nada. El dominio no incrementa la versión: lo hace el repositorio (el doble en memoria y, en la tarea 2, Drizzle). El caso no reintenta solo; quien llama recarga y decide.

## 8. Reglas y errores

Errores de dominio, sin status HTTP y sin texto de SQL. El nombre de clase es el contrato del test. Se reutilizan `BlankIdError`, `InvalidMoneyError` e `InvalidTaxRateError` del núcleo.

| Condición | Error | Capa |
|-----------|-------|------|
| `tableId` vacío o mayor de 40 | `InvalidTableIdError` | Dominio |
| `externalOrderId` vacío o mayor de 64 | `InvalidExternalOrderIdError` | Dominio |
| Ni mesa ni externo, o los dos | `InvalidOrderOriginError` | Dominio |
| Cantidad no entera, menor que 1 o mayor que 99 | `InvalidQuantityError` | Dominio |
| Plato inactivo | `MenuItemUnavailableError` | Dominio (al capturar) |
| Modificador que no es de ese plato | `UnknownModifierError` | Dominio (al capturar) |
| Mismo modificador dos veces | `DuplicateModifierSelectionError` | Dominio (al capturar) |
| Editar líneas fuera de `OPEN` | `OrderNotEditableError` | Dominio (State) |
| Transición no permitida | `InvalidOrderTransitionError` | Dominio (State) |
| Enviar a cocina sin líneas | `EmptyOrderError` | Dominio (State) |
| Línea que no está en la orden | `LineItemNotFoundError` | Dominio |
| Orden que no existe | `OrderNotFoundError` | Aplicación |
| Plato que no existe | `MenuItemNotFoundError` (ya existe) | Aplicación |
| `externalOrderId` ya usado por otra orden | `ExternalOrderIdInUseError` | Aplicación |
| Versión distinta al guardar | `OrderConcurrencyError` | Aplicación (puerto) |
| Id de orden repetido en `add` | `OrderAlreadyExistsError` | Aplicación (puerto) |

Orden de validación de `AddLine`, para que el error sea predecible: orden existe → se puede editar → plato existe → plato activo → cantidad → modificadores del plato → sin repetidos. Una orden en cocina responde `OrderNotEditableError` aunque el plato tampoco exista.

## 9. Casos de uso

Todos reciben puertos por constructor. Los que crean ids reciben `generateId: () => string`. `OpenOrder` recibe además `now: () => Date`. Ninguno lee `process.env`.

| Caso | Entrada | Efecto |
|------|---------|--------|
| `OpenOrder` | `tableId` o `externalOrderId` | Nueva orden `OPEN`, sin líneas, `version` 0 |
| `GetOrder` | `orderId` | La orden o `OrderNotFoundError` |
| `ListOrders` | Filtro opcional de estados | Órdenes por `openedAt` ascendente, luego id. Sin filtro, todas |
| `AddLine` | `orderId`, `menuItemId`, `quantity`, `modifierIds` | Línea nueva al final |
| `ModifyLine` | `orderId`, `lineId`, `quantity`, `modifierIds` | Línea recapturada en su lugar |
| `CancelLine` | `orderId`, `lineId` | Línea quitada |
| `StartCooking` | `orderId` | `OPEN` → `IN_KITCHEN` |
| `MarkOrderReady` | `orderId` | `IN_KITCHEN` → `READY` |
| `CancelOrder` | `orderId` | `OPEN` o `IN_KITCHEN` → `CANCELLED` |

Cada caso que escribe sigue la misma forma: `findById` → operación del agregado → `save`. Si el agregado lanza, no hay `save`. Todos devuelven la orden guardada.

`AddLine` y `ModifyLine` usan `MenuRepository.findById`. No se crea otro puerto para leer la carta: el que hay ya habla en lenguaje de dominio.

## 10. Capas

- **Dominio** (`domain/order/`): `OrderOrigin`, `Quantity`, `LineModifier`, `LineItem`, `OrderStatus` y sus estados, `Order`, errores de la sección 8 que son de dominio. Sin Nest, Drizzle, Zod ni HTTP. Importa `Money`, `TaxRate` y `MenuItem` del núcleo.
- **Aplicación** (`application/order/` + `application/ports/order-repository.ts`): puerto, errores de aplicación, nueve casos, doble en memoria.
- **Adaptadores:** ninguno en esta tarea. `AppModule` no cambia.

## 11. Decisiones confirmadas

Hector las confirmó el 4 de octubre de 2026. La 1 se apartó de la propuesta inicial (una sola orden viva por mesa).

| # | Tema | Decisión |
|---|------|----------|
| 1 | Mesa | Puede tener varias comandas vivas. Sin regla de mesa ocupada |
| 2 | Externo repetido | Nunca se repite, aunque la anterior esté cancelada |
| 3 | Cancelar línea | Se quita de la orden |
| 4 | Modificar línea | Recaptura precio y modificadores de la carta actual |
| 5 | Cancelar orden | Desde `OPEN` e `IN_KITCHEN` (diagrama del maestro) |
| 6 | `READY` en este sprint | Entra: `MarkOrderReady` y la vista de cocina |
| 7 | Cantidad | 1 a 99 |

Cambiar alguna de estas obliga a corregir este análisis y los tres planes antes de tocar código.

## 12. Qué hereda la tarea 2

Sin cambiar estas reglas, la persistencia tendrá que:

- Guardar el origen con un check de «exactamente uno».
- Respaldar la sección 6 con un único sobre `external_order_id` y traducir la violación a `ExternalOrderIdInUseError`. Sin índice único sobre la mesa.
- Implementar `save` con `where version = ?` y escribir `version + 1`.
- Guardar la copia de la línea y de sus modificadores sin FK a `menu_item_modifiers` (sus ids cambian al editar el plato).
- Leer con `Order.restore`, nunca con `open`, y fallar con un error de mapeo si una fila rompe el dominio.

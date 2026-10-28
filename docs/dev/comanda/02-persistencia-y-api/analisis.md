# Análisis — Tarea 2 · Persistencia y API de órdenes y cocina (E2 + E3)

**Rama:** `dev/comanda`  
**Sprint:** 2 (RF2–RF3). Tarea 2 de 3. Solo esta.  
**Fecha:** 4 de octubre de 2026  
**Estado:** acordado el 4 de octubre de 2026. No cambia código.  
**Plan:** `plan-de-accion.md` en esta carpeta.  
**Depende de:** `../01-orden-y-cocina/` cerrada.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Qué pide la tarea

Que las órdenes se guarden en Postgres y se recuperen después de reiniciar, y que un cliente HTTP pueda abrir, armar, enviar a cocina, marcar lista y cancelar. Los errores de negocio llegan con un `code` entendible.

Tarjetas de Trello: «Guardar órdenes en base de datos» y «API de órdenes y cocina».

## 2. Qué deja la tarea 1

- `Order`, `LineItem`, `OrderOrigin`, `Quantity`, estados y errores.
- `OrderRepository` con `add`, `save` con versión, `findById`, `findByExternalOrderId`, `list`.
- Una mesa puede tener varias comandas vivas; solo el `externalOrderId` es único.
- Nueve casos de uso probados con `InMemoryOrderRepository`.

Esta tarea no cambia ninguna de esas reglas ni firmas. Si el adaptador no puede cumplir el puerto, se para y se vuelve al análisis de la tarea 1.

## 3. Qué ya existe en la plataforma

| Pieza | Estado | Qué implica |
|-------|--------|-------------|
| `drizzle.config.ts` | `schema` apunta a un solo archivo, `schema/menu.ts` | Hay que pasarlo a la lista de archivos de esquema, o Drizzle Kit no ve las tablas nuevas |
| `client.ts` | Registra solo el esquema del menú en `drizzle(client, { schema })` | El query builder (`select().from(orders)`) no necesita ese registro. No se toca `client.ts` |
| `DrizzleMenuRepository` | Transacción por escritura; `23505` sobre la PK se traduce | Se copia la forma, no el archivo |
| Spec de integración del menú | Se salta salvo `MENU_REPOSITORY_INTEGRATION=1`; rollback por caso | El de órdenes usa su propia variable y el mismo patrón |
| `test:db` | Corre solo el spec del menú | Se amplía para correr los dos |
| `AppModule.register(db)` | Ya crea `MENU_REPOSITORY` | Los casos de orden reciben ese mismo proveedor |
| `main.ts` | `enableCors()` por defecto | `DELETE` y `PATCH` ya están permitidos |

## 4. Tablas

Nombres de tabla y columna solo viven aquí y en `infrastructure/`. No salen en el JSON.

### `orders`

| Columna | Tipo | Regla |
|---------|------|-------|
| `id` | text PK | |
| `table_id` | text null | `length(btrim) between 1 and 40` si no es nulo |
| `external_order_id` | text null | `length(btrim) between 1 and 64` si no es nulo |
| `status` | text not null | `in ('OPEN','IN_KITCHEN','READY','CLOSED','CANCELLED')` |
| `opened_at` | timestamptz not null | |
| `version` | integer not null default 0 | `>= 0` |

- Check `orders_origin_exactly_one`: `(table_id is null) <> (external_order_id is null)`.
- Sin índice único sobre `table_id`: una mesa puede tener varias comandas vivas.
- Único `orders_external_order_id_unique` sobre `external_order_id`. Respalda «el externo no se repite» si dos aperturas llegan a la vez. Los nulos no chocan entre sí.
- Índice `orders_status_opened_at_idx` sobre `(status, opened_at)` para el tablero de cocina.

### `order_lines`

| Columna | Tipo | Regla |
|---------|------|-------|
| `id` | text PK | |
| `order_id` | text not null | FK a `orders`, `on delete cascade` |
| `menu_item_id` | text not null | FK a `menu_items`, `on delete restrict` |
| `name` | text not null | no vacío tras `btrim` |
| `unit_price_amount` | integer not null | `>= 0` |
| `unit_price_currency` | text not null | longitud 3 |
| `tax_basis_points` | integer not null | `>= 0` |
| `quantity` | integer not null | `between 1 and 99` |
| `position` | integer not null | `>= 0`; único con `order_id` |

La FK a `menu_items` es segura: el menú desactiva, no borra. Si alguien borrara un plato a mano, Postgres lo impide mientras una línea lo nombre.

### `order_line_modifiers`

| Columna | Tipo | Regla |
|---------|------|-------|
| `order_line_id` | text not null | FK a `order_lines`, `on delete cascade` |
| `position` | integer not null | `>= 0` |
| `modifier_id` | text not null | Id del modificador **en el momento de capturar**. Sin FK |
| `name` | text not null | no vacío |
| `kind` | text not null | `in ('extra','exclusion')` |
| `price_amount` | integer null | |
| `price_currency` | text null | |

- PK compuesta `(order_line_id, position)`. Dos líneas pueden elegir el mismo modificador del menú; por eso `modifier_id` no es la llave.
- Check por tipo: extra con precio `>= 0` y moneda; exclusión con ambos nulos.
- **Sin FK a `menu_item_modifiers`.** `UpdateMenuItem` regenera los ids de modificador y el repositorio del menú borra las filas viejas. Una FK con `cascade` borraría lo que pidió el cliente; una con `restrict` impediría corregir la carta. La línea guarda su copia.

## 5. Repositorio

- `add`: transacción. Inserta orden, líneas y modificadores con `position` = índice. `23505` sobre `orders_pkey` → `OrderAlreadyExistsError`. Sobre `orders_external_order_id_unique` → `ExternalOrderIdInUseError`.
- `save`: transacción. `update orders set status, version = version + 1 where id = ? and version = ?`. Cero filas: si el id existe → `OrderConcurrencyError`; si no → `OrderNotFoundError`. Luego borra las líneas (la cascada borra sus modificadores) e inserta las del agregado. El origen no cambia en `save`, así que aquí no hay violación de externo.
- `findById`, `findByExternalOrderId`: orden + líneas + modificadores ordenados por `position`.
- `list`: filtra con `inArray(status, …)` si hay filtro; orden `opened_at`, `id`. Carga líneas solo de esas órdenes; con cero órdenes no consulta líneas.
- Lectura con `Order.restore` y `LineItem.restore`. Si una fila rompe el dominio, `OrderMappingError`. Sin `?? 0` ni `?? 'MXN'`.

La versión que devuelve la lectura es la de la fila. El dominio nunca la inventa.

## 6. Contrato HTTP

Vocabulario de producto. Sin nombres de tabla ni de columna.

| Método y ruta | Cuerpo | Caso | Éxito |
|---------------|--------|------|-------|
| `POST /orders` | `{ "tableId" }` o `{ "externalOrderId" }` | `OpenOrder` | 201 |
| `GET /orders?status=OPEN,IN_KITCHEN` | — | `ListOrders` | 200, arreglo |
| `GET /orders/:orderId` | — | `GetOrder` | 200 |
| `POST /orders/:orderId/lines` | `{ "menuItemId", "quantity", "modifierIds" }` | `AddLine` | 201 |
| `PATCH /orders/:orderId/lines/:lineId` | `{ "quantity", "modifierIds" }` | `ModifyLine` | 200 |
| `DELETE /orders/:orderId/lines/:lineId` | — | `CancelLine` | 200 |
| `POST /orders/:orderId/start-cooking` | `{}` | `StartCooking` | 200 |
| `POST /orders/:orderId/mark-ready` | `{}` | `MarkOrderReady` | 200 |
| `POST /orders/:orderId/cancel` | `{}` | `CancelOrder` | 200 |

Todas las respuestas de éxito devuelven la orden completa. La pantalla no tiene que volver a pedirla.

```json
{
  "id": "…",
  "tableId": "5",
  "externalOrderId": null,
  "status": "OPEN",
  "openedAt": "2026-10-04T18:30:00.000Z",
  "allowedActions": ["editLines", "startCooking", "cancel"],
  "lines": [
    {
      "id": "…",
      "menuItemId": "…",
      "name": "Tacos de suadero",
      "quantity": 2,
      "unitPrice": { "amount": 4500, "currency": "MXN" },
      "applicableTax": { "basisPoints": 1600 },
      "modifiers": [
        { "modifierId": "…", "name": "Queso", "kind": "extra", "price": { "amount": 1500, "currency": "MXN" } },
        { "modifierId": "…", "name": "Cilantro", "kind": "exclusion", "price": null }
      ]
    }
  ]
}
```

- `tableId` o `externalOrderId` es `null`, no se omite la clave.
- `version` no sale. Es un detalle de concurrencia del servidor.
- No hay `subtotal`, `total` ni importe por línea. Llegan en el Sprint 3.
- `allowedActions` sale del dominio. Es lo que la pantalla usa para habilitar botones.

### Traducción de errores

| Clase | Status | Por qué |
|-------|--------|---------|
| Zod | 400 `InvalidRequest` | Forma o tipo del cuerpo o de `status` |
| `InvalidTableIdError`, `InvalidExternalOrderIdError`, `InvalidOrderOriginError`, `InvalidQuantityError` | 422 | Dato de producto inválido |
| `MenuItemNotFoundError` | 422 | El plato es parte del cuerpo, no de la ruta |
| `MenuItemUnavailableError`, `UnknownModifierError`, `DuplicateModifierSelectionError`, `EmptyOrderError` | 422 | |
| `OrderNotFoundError`, `LineItemNotFoundError` | 404 | Recurso de la ruta |
| `OrderNotEditableError`, `InvalidOrderTransitionError` | 409 | Choca con el estado actual |
| `ExternalOrderIdInUseError` | 409 | Externo repetido |
| `OrderConcurrencyError` | 409 | Otro cambio llegó primero; recargar |
| `OrderMappingError` | 500 | Fila ilegible |
| Cualquier otro | 500 sin cuerpo de dominio | Se relanza |

Cuerpo de error: `{ "code", "message" }`, sin stack ni texto del driver. Igual que el menú.

## 7. Capas

- **Dominio y aplicación:** no cambian. Solo se agrega `OrderMappingError` junto a los errores de repositorio de orden.
- **Driven:** `schema/order.ts`, migración generada, `order.mapper.ts`, `DrizzleOrderRepository`, spec de integración.
- **Driving:** `interface/http/order/`: Zod, presentador, tabla de errores, controller y su spec con dobles.
- **Composition root:** `AppModule` crea `ORDER_REPOSITORY` con `DrizzleOrderRepository(db)` y los nueve casos con `crypto.randomUUID` y `() => new Date()`.

## 8. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Drizzle Kit no ve `schema/order.ts` | Cambiar `drizzle.config.ts` antes de `db:generate`. Revisar que el SQL generado crea tres tablas y no toca las del menú |
| Dos aperturas simultáneas del mismo externo | Único sobre `external_order_id` + traducción a `ExternalOrderIdInUseError`. Prueba P |
| Agregar línea mientras otra pestaña manda a cocina | `where version = ?`. Prueba P y smoke |
| Corregir la carta borra lo que pidió el cliente | Sin FK a modificadores del menú. Prueba P que edita el plato y relee la línea |
| `pnpm test` exige Postgres por accidente | El spec de integración se salta sin `ORDER_REPOSITORY_INTEGRATION=1` |

## 9. Qué no entra

Pantallas, totales, cierre, cobro, catálogo de mesas, paginación, websockets, `GET` de cocina distinto de `GET /orders?status=…`. Sin seeds de órdenes en migraciones.

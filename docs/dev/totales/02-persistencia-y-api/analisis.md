# Análisis — Tarea 2 · Persistencia y API de totales (E4)

**Rama:** `dev/totales`  
**Sprint:** 3 (RF4). Tarea 2 de 3. Solo esta.  
**Fecha:** 4 de octubre de 2026  
**Estado:** acordado el 4 de octubre de 2026. Empieza cuando la tarea 1 esté cerrada.  
**Plan:** `plan-de-accion.md` en esta carpeta.  
**Reglas de cálculo:** `../01-calculo-en-el-nucleo/analisis.md`. Aquí no se repiten ni se cambian.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Qué pide la tarea

Que el descuento y la propina sobrevivan un reinicio, y que un cliente HTTP pueda pedir el desglose y ajustarlo. Tarjeta de Trello: «API de desglose de totales — Devuelve subtotal, descuento, impuesto, propina, total».

## 2. Qué deja la tarea 1

- `Order` con `discount` y `tip`; `Order.restore` los exige.
- `CalculateTotals`, `SetOrderDiscount`, `SetOrderTip` probados con el doble en memoria.
- El mapper Drizzle pasa `discount: null, tip: null` para compilar. Todavía no lee ni escribe ajustes.

## 3. Qué hay en la persistencia hoy

- `orders`: `id`, `table_id`, `external_order_id`, `status`, `opened_at`, `version`, con checks de origen y estado (migraciones `0004` y `0005`).
- `DrizzleOrderRepository.save` hace `update orders set status, version = version + 1 where id = ? and version = ?` y reinserta las líneas. **No escribe nada más de `orders`.** Si se le olvida un campo nuevo, el ajuste se pierde sin error. Ese es el riesgo principal de la tarea.
- Hay órdenes de smoke y de demo del Sprint 2 en la base (no son seeds). La migración no puede romperlas.

## 4. Esquema

Columnas nuevas en `orders`, todas **nulas** y sin default:

| Columna | Tipo | Cuándo tiene valor |
|---------|------|--------------------|
| `discount_kind` | `text` | `percentage` o `fixedAmount`; nulo si no hay descuento |
| `discount_basis_points` | `integer` | Solo con `percentage`, de 1 a 10000 |
| `discount_amount` | `integer` | Solo con `fixedAmount`, mayor que 0 (lo pedido, no lo aplicado) |
| `discount_currency` | `text` | Solo con `fixedAmount`, 3 caracteres |
| `tip_kind`, `tip_basis_points`, `tip_amount`, `tip_currency` | igual | Igual que el descuento |

Checks:

- `orders_discount_kind`: nulo o una de las dos variantes.
- `orders_discount_shape`: todo nulo; o `percentage` con puntos base de 1 a 10000 y monto y moneda nulos; o `fixedAmount` con monto > 0, moneda de 3 caracteres y puntos base nulos.
- Lo mismo para `tip_*`.

Por qué así:

- Las filas que ya existen quedan con todo nulo y cumplen los checks: no hace falta default ni backfill.
- Los checks respaldan las reglas del dominio. No las sustituyen: el mapper vuelve a armar `Discount` y `Tip` con sus fábricas y falla con `OrderMappingError` si algo no cuadra (por ejemplo, moneda `USD`, que el check de longitud deja pasar).
- Se guarda **lo pedido** del descuento fijo, no lo aplicado. Lo aplicado depende de las líneas y se calcula al leer (decisión 3 del análisis de la tarea 1).
- No se guardan totales. Son derivados.

Migración: `db:generate` → revisar el SQL → `db:migrate` → `\d orders`. Sin SQL a mano.

## 5. Repositorio y mapper

| Pieza | Cambio |
|-------|--------|
| `order.mapper.ts` | Columnas → `Discount \| null` y `Tip \| null` con `Percentage.of`, `Money.of` y las fábricas del dominio. Errores del dominio → `OrderMappingError`. Y al revés: `Discount` / `Tip` → columnas |
| `DrizzleOrderRepository.add` | Inserta las columnas de ajuste |
| `DrizzleOrderRepository.save` | El `set` incluye las ocho columnas, junto con `status` y `version`, dentro de la misma transacción |

El puerto `OrderRepository` no cambia.

## 6. Contrato HTTP

| Método | Ruta | Caso | Respuesta |
|--------|------|------|-----------|
| `GET` | `/orders/:orderId/totals` | `CalculateTotals` | 200 desglose |
| `PUT` | `/orders/:orderId/discount` | `SetOrderDiscount` | 200 desglose |
| `PUT` | `/orders/:orderId/tip` | `SetOrderTip` | 200 desglose |

Cuerpos:

```json
{ "discount": { "kind": "percentage", "basisPoints": 1000 } }
{ "discount": { "kind": "fixedAmount", "amount": 5000 } }
{ "discount": null }
{ "tip": { "kind": "percentage", "basisPoints": 1500 } }
{ "tip": null }
```

Desglose (vocabulario de producto; sin nombres de tabla ni `version`). Ejemplo con la orden de la sección 5.8 del análisis de la tarea 1 y descuento 10 %:

```json
{
  "orderId": "…",
  "currency": "MXN",
  "adjustable": true,
  "lines": [
    { "lineId": "…", "name": "Tacos de suadero", "quantity": 2,
      "unitAmount": { "amount": 6000, "currency": "MXN" },
      "lineSubtotal": { "amount": 12000, "currency": "MXN" },
      "applicableTax": { "basisPoints": 1600 } },
    { "lineId": "…", "name": "Agua de jamaica", "quantity": 1,
      "unitAmount": { "amount": 2500, "currency": "MXN" },
      "lineSubtotal": { "amount": 2500, "currency": "MXN" },
      "applicableTax": { "basisPoints": 0 } }
  ],
  "subtotal": { "amount": 14500, "currency": "MXN" },
  "discount": { "kind": "percentage", "basisPoints": 1000,
                "amount": { "amount": 1450, "currency": "MXN" } },
  "taxes": [
    { "basisPoints": 0, "taxableBase": { "amount": 2250, "currency": "MXN" }, "amount": { "amount": 0, "currency": "MXN" } },
    { "basisPoints": 1600, "taxableBase": { "amount": 10800, "currency": "MXN" }, "amount": { "amount": 1728, "currency": "MXN" } }
  ],
  "taxTotal": { "amount": 1728, "currency": "MXN" },
  "tip": null,
  "total": { "amount": 14778, "currency": "MXN" }
}
```

- Descuento fijo: `{ "kind": "fixedAmount", "requested": Money, "amount": Money }`.
- Propina: `{ "kind": "percentage", "basisPoints", "amount" }` o `{ "kind": "fixedAmount", "amount" }`.
- `adjustable` sale de `order.canAdjustTotals()`.

Reglas del borde, iguales al Sprint 2:

- Zod `.strict()` valida forma y tipo. `kind` desconocido es forma: 400.
- Los rangos los responde el dominio: `basisPoints: 0` llega al caso y responde 422.
- El id viene solo de la ruta.

**El JSON de `GET /orders/:id` no cambia.** No gana totales, descuento ni propina. Comandas y cocina siguen iguales.

## 7. Errores HTTP

Una tabla propia en `totals-http.errors.ts` con los errores nuevos. Lo que no reconoce lo delega en `toOrderHttpError` del Sprint 2, para no duplicar `OrderNotFoundError`, `OrderConcurrencyError`, `OrderMappingError` ni el 400 de Zod.

| Error | HTTP |
|-------|------|
| `InvalidPercentageError` | 422 |
| `InvalidDiscountError` | 422 |
| `InvalidTipError` | 422 |
| `InvalidMoneyError` | 422 |
| `MoneyOverflowError` | 422 |
| `OrderTotalsNotAdjustableError` | 409 |
| `OrderNotFoundError` | 404 (delegado) |
| `OrderConcurrencyError` | 409 (delegado) |
| `OrderMappingError` | 500 (delegado) |
| `ZodError` | 400 `InvalidRequest` (delegado) |
| Otro | sin traducir → 500 de Nest, sin `code` inventado |

## 8. Capas

- **Driven:** columnas y checks en `schema/order.ts`, migración `0006`, mapper, `DrizzleOrderRepository`.
- **Driving:** `interface/http/totals/` (Zod, presentador, errores, controller). Carpeta propia: el dueño es el módulo Cálculo.
- **Composition root:** `AppModule` cablea los tres casos con `ORDER_REPOSITORY` y el `TotalsController`.
- **Dominio y aplicación:** no cambian. Si hiciera falta, se para y se vuelve a la tarea 1.

## 9. Fuera de alcance

Pantallas, cobro, cierre, foto de totales, endpoint de totales en lote para la lista de comandas, cambios al JSON de órdenes, seeds.

## 10. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| `save` no escribe un ajuste | P16–P18 y la prueba de control del plan |
| La migración trae algo distinto de `ADD COLUMN` + `CHECK` | Revisión del SQL antes de migrar; `drizzle-kit drop` y regenerar |
| Una fila vieja rompe la lectura | Columnas nulas; P15 y conteo de filas antes y después |
| El contrato del Sprint 2 cambia | H43 y H1–H25 sin cambio |
| Un 422 escribe | H41 con doble espía |

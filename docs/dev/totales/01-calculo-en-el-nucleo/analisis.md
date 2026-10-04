# Análisis — Tarea 1 · Cálculo de totales en el núcleo (E4)

**Rama:** `dev/totales`  
**Sprint:** 3 (RF4). Tarea 1 de 3. Solo esta.  
**Fecha:** 4 de octubre de 2026  
**Estado:** acordado el 4 de octubre de 2026 (sección 13). No cambia código.  
**Plan:** `plan-de-accion.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Mapa del sprint

El Sprint 3 se demuestra así: en una orden armada con el Sprint 2 se abre «Cuenta», se ajusta la propina o el descuento, se ve el desglose y, al repetir los mismos ajustes, salen **los mismos números**. Se parte en tres tareas, igual que menú y comanda:

| Tarea | Carpeta | Entrega | Se prueba con |
|-------|---------|---------|---------------|
| 1 | `01-calculo-en-el-nucleo/` | Operaciones de `Money`, `Percentage`, Strategies de descuento y propina, cálculo de totales, descuento y propina en `Order`, casos `CalculateTotals`, `SetOrderDiscount`, `SetOrderTip` | Vitest, sin Postgres ni navegador |
| 2 | `02-persistencia-y-api/` | Columnas de descuento y propina en `orders` (migración Drizzle Kit), mapper, repositorio, REST de totales | Vitest + Postgres en transacción + `curl` |
| 3 | `03-pantalla-cuenta-y-demo/` | Pantalla «Cuenta» en `/orders/[orderId]/totals`, enlace desde el detalle, demo y CTTM | Vitest de funciones puras + recorrido en navegador |

Esta tarea fija el contrato que las otras dos cumplen sin cambiar reglas. Si la 2 o la 3 necesitan otra regla, se para y se vuelve a este análisis.

## 2. Qué pide el sprint

RF4: calcular subtotales, propinas opcionales, descuentos promocionales e impuestos **de forma determinista**.

| Tarjeta de Trello (`plan-sprints-trello.md`) | Tarea |
|----------------------------------------------|-------|
| Dinero / montos sin errores de redondeo raros | 1 |
| Descuentos, impuestos y propina | 1 |
| Calcular totales de la orden | 1 |
| API de desglose de totales | 2 |
| Pantalla de cuenta (desglose) | 3 |
| Demo Sprint 3 — totales estables en el navegador | 3 |

## 3. Qué ya existe

| Ya existe | No existe |
|-----------|-----------|
| `Money`: centavos enteros, solo `MXN`, tope int4 (`2_147_483_647`). Solo construye; no suma ni multiplica | Operaciones de dinero (sumar, restar, multiplicar, porcentaje, prorrateo) |
| `TaxRate` en puntos base (`1600` = 16 %) | Porcentaje de descuento o propina |
| `LineItem` con copia de precio del plato, tasa, cantidad y modificadores (el extra con su precio, la exclusión con `null`) | Importe de línea, subtotal, impuesto de la cuenta, total |
| `Order` con estados State, `allowedActions()` y `version` | Descuento y propina en la orden |
| `OrderRepository` y su doble en memoria con control de versión | Casos de uso de cálculo |

Hechos del código que pesan en el diseño:

1. **La línea ya trae todo lo que el cálculo necesita.** Precio, tasa y precio de cada extra se copiaron al pedir. El cálculo no lee el menú; si alguien cambia la carta, la cuenta no se mueve.
2. **`Order.copy` y `InMemoryOrderRepository.copy` reconstruyen la orden campo por campo.** Un campo nuevo que no se copie desaparece en la siguiente operación. Eso lleva prueba propia (OA9 y RP9 del plan).
3. **18 aserciones del Sprint 2 comparan `allowedActions` literal** (casos, HTTP y web). Por eso «se puede ajustar la cuenta» no entra a `allowedActions` (decisión 7).
4. La carta viva (4 de octubre) tiene `Agua de jamaica` con tasa `0` y el resto con `1600`. Sirve para demostrar dos tasas en la misma cuenta sin tocar el menú.

## 4. Alcance

Entra:

- Operaciones enteras de `Money` y su redondeo.
- `Percentage` (puntos base 1–10000).
- Descuento de la orden: porcentaje o monto fijo (Strategy).
- Propina opcional: porcentaje o monto fijo (Strategy).
- Impuestos por la tasa capturada en cada línea.
- Cálculo de totales determinista y su desglose.
- Descuento y propina como parte del agregado `Order`.
- `CalculateTotals`, `SetOrderDiscount`, `SetOrderTip` y el doble en memoria al día.

No entra:

- Drizzle, migración, HTTP, `AppModule`. Es la tarea 2.
- `apps/web`. Es la tarea 3.
- Cobro, cierre, `CLOSED` (Sprint 4). El estado ya existe; ninguna operación lleva a él.
- Catálogo de promociones o cupones, descuento por línea, varios descuentos apilados, motivo o autorización del descuento.
- Dividir la cuenta, ticket, facturación, monedas distintas de `MXN`.
- Cambios a menú o a las reglas RF3. Si algo estorba, se anota; no se arregla de paso.
- Guardar una foto de los totales. Se derivan cada vez de las líneas y los ajustes.

## 5. Modelo

Nombres de código en inglés. En producto se dice cuenta, subtotal, descuento, impuesto, propina, total.

| Tipo | Rol | Dónde |
|------|-----|-------|
| `Money` (ampliado) | `add`, `subtract`, `times`, `percentage`, `allocate`. Siempre enteros | `domain/money/` |
| `Percentage` | Puntos base enteros de 1 a 10000 (0.01 % a 100 %) | `domain/totals/` |
| `Discount` | Strategy: porcentaje o monto fijo. Responde cuánto se descuenta de un subtotal | `domain/totals/` |
| `Tip` | Strategy: porcentaje o monto fijo. Responde cuánto es la propina sobre una base | `domain/totals/` |
| `OrderTotals` | Desglose: líneas, subtotal, descuento, impuestos por tasa, propina, total | `domain/totals/` |
| `calculateTotals` | Función pura: líneas + descuento + propina → `OrderTotals` | `domain/totals/` |
| `Order` (ampliado) | Guarda `discount` y `tip`; `setDiscount`, `setTip`, `totals()` | `domain/order/` |

Dependencias dentro del dominio: `order → totals → money, menu/tax-rate`. `domain/totals` no importa `domain/order`: recibe las líneas como datos (`TotalsLine`). Sin ciclo, y el cálculo se prueba sin armar órdenes.

### 5.1 Importe de línea

```text
unitAmount   = precio del plato + suma de precios de sus extras   (las exclusiones suman 0)
lineSubtotal = unitAmount × cantidad
```

Los extras pagan la tasa de su plato.

### 5.2 Subtotal

`subtotal = suma de lineSubtotal`. Sin líneas, `0`.

### 5.3 Descuento (Strategy)

Uno por orden, o ninguno. Se aplica **antes** de impuestos: baja la base gravable.

| Variante | Monto aplicado |
|----------|----------------|
| Porcentaje (`Percentage`) | `subtotal × porcentaje`, redondeado (sección 5.7) |
| Monto fijo (`Money` > 0) | `min(monto, subtotal)`. Si lo pedido supera el subtotal se topa; el desglose muestra lo pedido y lo aplicado |

El tope existe porque las líneas siguen cambiando mientras la orden está abierta: un descuento fijo de $50 en una cuenta de $145 sigue siendo válido si luego se quitan platos y la cuenta baja a $40.

**Reparto entre tasas.** El descuento se reparte entre los grupos de tasa en proporción a su base, por **residuo mayor**: cada grupo recibe la parte entera; los centavos que sobran van uno por uno a los grupos con mayor residuo; si empatan, primero el de tasa menor. La suma de las partes es exactamente el descuento.

### 5.4 Impuestos

- El precio de la carta es **sin impuesto**; el impuesto se suma encima.
- Se agrupan las líneas por tasa (`basisPoints`).
- `base del grupo = suma de lineSubtotal del grupo − su parte del descuento`.
- `impuesto del grupo = base × tasa`, redondeado **una vez por grupo**.
- Se muestran todos los grupos, también el de 0 %, por tasa ascendente.
- `taxTotal = suma de los impuestos de grupo`.

No hay Strategy de impuesto: con una sola regla no resuelve nada (sección 14).

### 5.5 Propina (Strategy)

Opcional. No paga impuesto.

| Variante | Monto |
|----------|-------|
| Porcentaje (`Percentage`) | `(subtotal − descuento) × porcentaje`, redondeado |
| Monto fijo (`Money` > 0) | El monto, aunque la base sea 0 |

### 5.6 Total

```text
total = subtotal − descuento + taxTotal + propina
```

Invariantes que las pruebas revisan en cada caso:

- `suma de bases de impuesto = subtotal − descuento`
- `suma del reparto del descuento = descuento`
- `total = subtotal − descuento + taxTotal + propina`
- Ningún monto es negativo.

### 5.7 Aritmética y redondeo

- Todo en centavos enteros. Sin `float`, sin `toFixed`, sin `Math.round` sobre decimales.
- Productos intermedios con `BigInt`: `2_147_483_647 × 10000` no cabe exacto en `number`.
- Redondeo **mitad hacia arriba** (todos los montos son ≥ 0): `(monto × puntosBase + 5000) div 10000`.
- Un resultado mayor al tope de `Money` lanza `MoneyOverflowError`. No hay resultado parcial.
- Mismo input → mismo `OrderTotals`. El orden de las líneas no cambia subtotal, impuestos ni total.

### 5.8 Ejemplo trabajado (con la carta de la demo)

Tacos de suadero `4500`, tasa `1600`, extra Queso `1500`. Agua de jamaica `2500`, tasa `0`.  
Orden: Tacos × 2 con Queso, Agua × 1.

| Concepto | Cálculo | Centavos |
|----------|---------|----------|
| Línea tacos | (4500 + 1500) × 2 | 12000 |
| Línea agua | 2500 × 1 | 2500 |
| Subtotal | | 14500 |
| Sin ajustes: impuesto 16 % | 12000 × 0.16 | 1920 |
| Sin ajustes: total | 14500 + 1920 | **16420** |
| Descuento 10 % | 14500 × 0.10 | 1450 |
| Reparto | 16 %: 1200 · 0 %: 250 | 1450 |
| Impuesto 16 % | (12000 − 1200) × 0.16 | 1728 |
| Total con descuento | 13050 + 1728 | **14778** |
| Propina 10 % | 13050 × 0.10 | 1305 |
| Total con descuento y propina | 14778 + 1305 | **16083** |
| Propina 15 % en su lugar | 13050 × 0.15 = 1957.5 → | 1958 |
| Total | 14778 + 1958 | **16736** |
| Descuento fijo $50 (sin propina) | reparto 4137.93 / 862.07 → 4138 / 862 | 5000 |
| Impuesto 16 % | (12000 − 4138) × 0.16 = 1257.92 → | 1258 |
| Total | 9500 + 1258 | **10758** |
| Descuento fijo $200 | se topa en 14500; base 0; impuesto 0 | total **0** |

Estos números son el contrato de las pruebas TT y, en las tareas 2 y 3, del smoke y del recorrido.

## 6. Cuándo se ajusta la cuenta

Ajustar descuento o propina **no es editar líneas**: no toca lo que prepara la cocina. Se permite mientras la orden siga viva.

| Estado | Ajustar descuento / propina | Ver totales |
|--------|-----------------------------|-------------|
| `OPEN` | Sí | Sí |
| `SENT_TO_KITCHEN` | Sí | Sí |
| `IN_KITCHEN` | Sí | Sí |
| `READY` | Sí | Sí |
| `CLOSED` | No | Sí |
| `CANCELLED` | No | Sí |

Cada objeto State gana `canAdjustTotals`. Sin `if (status === …)` en casos de uso. `canEditLines`, transiciones y `allowedActions()` no cambian.

## 7. Concurrencia

`SetOrderDiscount` y `SetOrderTip` siguen la forma de los casos del Sprint 2: `findById` → operación del agregado → `save` con versión. Dos pestañas que ajustan a la vez: la segunda recibe `OrderConcurrencyError` y no escribe. Ajustar la propina mientras otra pestaña manda a cocina: igual, una pierde y recarga.

## 8. Errores

Clase con `name` propio, mensaje fijo en inglés, sin HTTP ni SQL. La traducción a HTTP es de la tarea 2.

| Condición | Error | Capa |
|-----------|-------|------|
| Porcentaje no entero, menor que 1 o mayor que 10000 | `InvalidPercentageError` | Dominio |
| Descuento fijo de 0, o variante desconocida | `InvalidDiscountError` | Dominio |
| Propina fija de 0, o variante desconocida | `InvalidTipError` | Dominio |
| Monto negativo o no entero | `InvalidMoneyError` (ya existe) | Dominio |
| Resultado mayor al tope de `Money` | `MoneyOverflowError` | Dominio |
| Restar más de lo que hay | `NegativeMoneyError` | Dominio (error de programación) |
| Multiplicar por algo que no es entero ≥ 0 | `InvalidMultiplierError` | Dominio (error de programación) |
| Prorratear un monto > 0 con pesos en 0 | `InvalidAllocationError` | Dominio (error de programación) |
| Ajustar en `CLOSED` o `CANCELLED` | `OrderTotalsNotAdjustableError` | Dominio (State) |
| Orden que no existe | `OrderNotFoundError` (ya existe) | Aplicación |
| Versión distinta al guardar | `OrderConcurrencyError` (ya existe) | Aplicación (puerto) |

Orden de validación de `SetOrderDiscount` y `SetOrderTip`: orden existe → se puede ajustar → valor válido. Una orden cancelada responde `OrderTotalsNotAdjustableError` aunque el porcentaje también sea inválido.

## 9. Casos de uso

Reciben `OrderRepository` por constructor. Ninguno lee `process.env`, la hora ni el menú.

| Caso | Entrada | Efecto | Escribe |
|------|---------|--------|---------|
| `CalculateTotals` | `orderId` | `OrderTotals` de la orden guardada | No |
| `SetOrderDiscount` | `orderId`, `discount` (`percentage` + `basisPoints`, `fixedAmount` + `amount`, o `null`) | Guarda el descuento y devuelve los totales | Sí |
| `SetOrderTip` | `orderId`, `tip` (misma forma, o `null`) | Guarda la propina y devuelve los totales | Sí |

`null` quita el ajuste. Los casos que escriben devuelven los totales de la orden **releída** después de guardar, como `AddLine`.

Viven en `application/totals/` (módulo Cálculo). Usan el mismo puerto `OrderRepository`: la cuenta es parte del agregado `Order`, así que no hace falta otro puerto.

## 10. Capas

- **Dominio:** `Money` ampliado; `domain/totals/` (`Percentage`, `Discount`, `Tip`, `calculateTotals`, `OrderTotals`, errores); `Order` con `discount`, `tip`, `setDiscount`, `setTip`, `totals()`; `canAdjustTotals` en cada State. Sin Nest, Drizzle, Zod ni HTTP.
- **Aplicación:** `application/totals/` con los tres casos. El doble en memoria copia los campos nuevos.
- **Adaptadores:** ninguno, salvo pasar `discount: null, tip: null` en el mapper para que compile (el plan lo explica). `AppModule` no cambia.

## 11. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Un campo nuevo de `Order` se pierde en `copy` o en el doble | `Order.restore` exige `discount` y `tip` (sin opcional): el typecheck marca cada llamador. Pruebas OA9 y RP9 |
| Redondeo con `float` | `BigInt` en productos; revisión R3 con `rg` sobre `Math.round`, `toFixed`, `parseFloat` |
| El reparto del descuento no cuadra por un centavo | Residuo mayor e invariante «suma del reparto = descuento» en cada caso TT |
| Romper RF3 o el contrato del Sprint 2 | `allowedActions` igual (OA10, R7); S1–S8 y OR1–OR16 del Sprint 2 siguen |

## 12. Qué heredan las tareas 2 y 3

Sin cambiar estas reglas:

- **Tarea 2** guarda descuento y propina en `orders` con columnas nulas y checks de coherencia; el `save` de Drizzle (que hoy solo escribe `status` y `version`) los incluye; el mapper falla con `OrderMappingError` si una fila no cumple el dominio; HTTP expone `GET /orders/:id/totals`, `PUT …/discount`, `PUT …/tip`. El JSON de `GET /orders/:id` no cambia.
- **Tarea 3** muestra el desglose que devuelve la API y manda los ajustes. No suma, no multiplica, no aplica porcentajes.

## 13. Decisiones confirmadas

Hector las confirmó el 4 de octubre de 2026.

| # | Tema | Decisión |
|---|------|----------|
| 1 | Precio de la carta | Sin impuesto: el impuesto se suma encima |
| 2 | Redondeo del impuesto | Una vez por grupo de tasa, mitad hacia arriba |
| 3 | Descuento | Uno por orden, porcentaje o monto fijo, antes de impuestos, repartido por residuo mayor; el fijo se topa en el subtotal y la pantalla avisa |
| 4 | Propina | Opcional, porcentaje o fijo, sobre subtotal − descuento, sin impuesto |
| 5 | Dónde viven descuento y propina | Guardados en la orden (migración en la tarea 2). El Sprint 4 cobra el total sin pedirlos de nuevo |
| 6 | Cuándo se ajustan | `OPEN`, `SENT_TO_KITCHEN`, `IN_KITCHEN`, `READY`; no en `CLOSED` ni `CANCELLED` |
| 7 | Cómo sabe la UI si puede ajustar | `adjustable` en el desglose; `allowedActions` no cambia |
| 8 | API | Recurso aparte `GET /orders/:id/totals` + `PUT …/discount` + `PUT …/tip`; el JSON de la orden no cambia |
| 9 | Pantalla | `/orders/[orderId]/totals` «Cuenta», atajos de propina 10/15/20 % |

Cambiar alguna obliga a corregir este análisis y los tres planes antes de tocar código.

## 14. Coincidencias y choques con la documentación

- Gen 1 y la propuesta piden `CalculateTotals`, `Money` y Strategy de descuento. Se usan.
- La propuesta menciona Strategy de impuesto «opcional, según jurisdicción». Con una sola regla (decisión 1) no se crea.
- El ejemplo de Gen 1 `order.totals.total` es ilustrativo. Con la decisión 8 la pantalla lee `totals.total` de `GET /orders/:id/totals`; la regla de fondo (el cliente no calcula) es la misma.
- El plan de la tarea 1 del Sprint 2 aún describe `startCooking` con cinco estados; el código y la corrida CTTM ya usan `SENT_TO_KITCHEN`. Ya está anotado en `pruebas-cttm.md`; este sprint no lo toca.

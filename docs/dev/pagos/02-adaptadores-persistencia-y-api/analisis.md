# Análisis — Tarea 2 · Adaptadores de cobro, persistencia y API (E5)

**Rama:** `dev/pagos`  
**Sprint:** 4 (RF5). Tarea 2 de 3. Solo esta.  
**Fecha:** 4 de octubre de 2026  
**Estado:** cerrada el 4 de octubre de 2026 (ver plan §11).  
**Plan:** `plan-de-accion.md` en esta carpeta.  
**Reglas de cobro:** `../01-cobro-en-el-nucleo/analisis.md`. Aquí no se repiten ni se cambian.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Qué pide la tarea

Que los tres medios de cobro existan como adaptadores intercambiables, que el pago y el cierre sobrevivan un reinicio, y que un cliente HTTP pueda cobrar y consultar el pago. Tarjetas de Trello: «Medios de cobro: efectivo, tarjeta y digital (simulados)» (la parte de adaptadores) y «API de cierre / pago — Elegir medio de pago; respuesta clara de cobro».

## 2. Qué deja la tarea 1

- `PaymentPort` con `method`, `charge` y `voidCharge`; `ChargeRequest`, `Payment`, `PaymentDetails` en el dominio.
- `Order` con `payment`, `close`, `canClose`; `Order.restore` exige `payment` y la invariante `CLOSED ⇔ payment`.
- `CloseOrder` y `GetOrderPayment` probados con el doble en memoria y el doble de cobro.
- `READY.allowedActions()` es `['close']`.
- El mapper de Drizzle pasa `payment: null` para compilar. Todavía no lee ni escribe pagos.

## 3. Qué hay hoy en infraestructura

- `infrastructure/payment/index.ts` existe y está vacío.
- `orders` tiene el check `orders_status` que ya admite `CLOSED`, y las columnas de descuento y propina (migraciones `0006` y `0007`).
- `DrizzleOrderRepository.save` actualiza `orders` con control de versión y reinserta líneas en una transacción. **No escribe nada más.** Si se le olvida el pago, la orden quedaría `CLOSED` sin pago y la siguiente lectura fallaría con `OrderMappingError`. Ese es el riesgo principal de la tarea.
- Lección del Sprint 3 (`0007`): en Postgres `length(null) = 3` es nulo y el check **pasa**. Toda forma por medio debe pedir `is not null` de forma explícita.
- Hay órdenes de smoke y de demo de sprints anteriores en la base (no son seeds). La migración no puede romperlas y no debe haber ninguna `CLOSED` (no había forma de llegar ahí).

## 4. Adaptadores de cobro (driven)

Viven en `infrastructure/payment/`. Implementan `PaymentPort`. Son **simulados**: no hay red, ni SDK, ni temporizadores, ni azar, ni `process.env`. Reciben un generador de referencias por constructor para que las pruebas sean deterministas.

| Adaptador | `method` | Aprueba | Rechaza (`declined`) | Simula caída (lanza `PaymentProcessorUnavailableError`) | Referencia |
|-----------|----------|---------|----------------------|----------------------------------------------------------|------------|
| `CashPaymentAdapter` | `cash` | Siempre (que el efectivo alcance ya lo decidió el núcleo) | Nunca | Nunca | `cash-<id>` (folio de caja) |
| `CardPaymentAdapter` | `card` | Cualquier `cardLast4` salvo los de la derecha | `0002` → `cardDeclined` | `0119` | `card-<id>` |
| `DigitalGatewayFakeAdapter` | `digitalGateway` | Cualquier referencia salvo las de la derecha | `rechazo@pasarela.test` → `gatewayDeclined` | `caida@pasarela.test` | `gateway-<id>` |

- Los disparadores son **datos de prueba del simulador**, constantes del adaptador. El núcleo no los conoce. Se documentan aquí y en la pantalla no se anuncian.
- La comparación de la referencia de pasarela es sin distinguir mayúsculas (el núcleo ya recortó espacios).
- Una petición de otro medio (por ejemplo, `ChargeRequest` de tarjeta al adaptador de efectivo) es error de programación y lanza.
- `voidCharge(reference)` resuelve y deja la referencia en una lista de anuladas del adaptador (solo para pruebas). No cambia nada más.
- Cambiar un simulador por uno real mañana es escribir otro adaptador con el mismo puerto y cambiar una línea del `AppModule`. Ni el caso ni el dominio cambian.

## 5. Esquema

Tabla nueva `order_payments`, **1 a 1** con `orders`. `orders` no cambia.

| Columna | Tipo | Regla |
|---------|------|-------|
| `order_id` | `text` PK | FK a `orders.id`, `on delete cascade` |
| `payment_id` | `text not null` | Único |
| `method` | `text not null` | `cash`, `card` o `digitalGateway` |
| `amount` | `integer not null` | ≥ 0 (el total cobrado) |
| `currency` | `text not null` | 3 caracteres |
| `tendered_amount` | `integer` | Solo efectivo; no nulo y ≥ `amount` |
| `card_last4` | `text` | Solo tarjeta; `^[0-9]{4}$` |
| `payer_reference` | `text` | Solo pasarela; 3 a 64 caracteres tras recortar |
| `reference` | `text not null` | 1 a 64 caracteres tras recortar |
| `paid_at` | `timestamptz not null` | Hora del cobro (reloj del caso) |

Checks:

- `order_payments_method`: una de las tres variantes.
- `order_payments_amount_gte_0`, `order_payments_currency_len_3`, `order_payments_reference_len`.
- `order_payments_shape`: efectivo con `tendered_amount is not null and tendered_amount >= amount` y los otros dos nulos; tarjeta con `card_last4 is not null and card_last4 ~ '^[0-9]{4}$'` y los otros dos nulos; pasarela con `payer_reference is not null and length(btrim(payer_reference)) between 3 and 64` y los otros dos nulos.

Por qué así:

- **Tabla aparte y no columnas en `orders`:** las órdenes vivas no cargan ocho columnas nulas más; la llave primaria en `order_id` garantiza «un pago por orden» en la base, no solo en el dominio.
- **No se guarda el cambio.** Es derivado (`tendered − amount`), igual que los totales del Sprint 3.
- **Sin backfill:** es una tabla nueva y ninguna orden está `CLOSED`.
- **Lo que la base no puede revisar** (que `CLOSED` tenga fila de pago y viceversa, que `amount` sea igual al total) lo revisa el dominio al leer: `Order.restore` lanza `InvalidOrderPaymentError` y el mapper responde `OrderMappingError`.
- Los checks respaldan al dominio; no lo sustituyen. Moneda `USD` pasa el check de longitud y el mapper la rechaza.

Migración: `db:generate` → revisar el SQL → `db:migrate` → `\d order_payments`. Sin SQL a mano.

## 6. Repositorio y mapper

| Pieza | Cambio |
|-------|--------|
| `order.mapper.ts` | Fila de pago → `PaymentDetails` + `Payment.restore`; `toOrder` recibe la fila de pago (o `null`). Errores del dominio de pago → `OrderMappingError`. Y al revés: `Payment` → fila |
| `DrizzleOrderRepository.hydrate` | Una consulta más por lote (`inArray` de ids), como las líneas. Sin N+1 |
| `DrizzleOrderRepository.add` | Si la orden trae pago (no pasa hoy), lo inserta en la misma transacción |
| `DrizzleOrderRepository.save` | Dentro de la **misma** transacción que el `update` con versión: si `order.payment !== null`, inserta la fila (`on conflict (order_id) do nothing`). Si el `insert` falla, se revierte también el cambio de estado |

El puerto `OrderRepository` no cambia.

## 7. Contrato HTTP

| Método | Ruta | Caso | Respuesta |
|--------|------|------|-----------|
| `POST` | `/orders/:orderId/close` | `CloseOrder` | 200 orden cerrada y pago |
| `GET` | `/orders/:orderId/payment` | `GetOrderPayment` | 200 orden y pago |

Cuerpos de `POST …/close` (centavos enteros, como los ajustes del Sprint 3):

```json
{ "expectedTotal": 16420, "payment": { "method": "cash", "tendered": 20000 } }
{ "expectedTotal": 16420, "payment": { "method": "card", "cardLast4": "4242" } }
{ "expectedTotal": 16420, "payment": { "method": "digitalGateway", "payerReference": "cliente@correo.mx" } }
```

Respuesta (las dos rutas responden la misma forma; vocabulario de producto, sin nombres de tabla ni `version`):

```json
{
  "orderId": "…",
  "status": "CLOSED",
  "payment": {
    "id": "…",
    "method": "cash",
    "amount": { "amount": 16420, "currency": "MXN" },
    "tendered": { "amount": 20000, "currency": "MXN" },
    "change": { "amount": 3580, "currency": "MXN" },
    "cardLast4": null,
    "payerReference": null,
    "reference": "cash-…",
    "paidAt": "2026-10-04T18:00:00.000Z"
  }
}
```

- Las llaves de `payment` son siempre las mismas; lo que no aplica al medio va en `null` (no se inventan literales).
- `change` lo calcula el dominio (`Payment.change`). La web solo lo muestra.

Reglas del borde, iguales a los sprints anteriores:

- Zod `.strict()` con `discriminatedUnion('method')` valida forma y tipo. `method` desconocido es forma: 400.
- Los rangos los responde el dominio: `cardLast4: "12"` llega al caso y responde 422.
- El id viene solo de la ruta.

**El JSON de `GET /orders/:id` no gana el pago.** El único cambio visible es que una orden `READY` trae `allowedActions: ["close"]`. Comandas y cocina siguen iguales.

## 8. Errores HTTP

Una tabla propia en `payment-http.errors.ts`. Lo que no reconoce lo delega en `toOrderHttpError` del Sprint 2 (`OrderNotFoundError`, `OrderConcurrencyError`, `OrderMappingError`, `InvalidOrderTransitionError`, 400 de Zod).

| Error | HTTP | Por qué |
|-------|------|---------|
| `InvalidPaymentMethodError`, `InvalidCardLast4Error`, `InvalidPayerReferenceError`, `InvalidMoneyError`, `InsufficientCashError` | 422 | Dato de negocio inválido |
| `PaymentDeclinedError` | 402 | El procesador rechazó. La orden sigue `READY` |
| `OrderNotClosableError` | 409 | Estado de la orden |
| `PaymentAmountMismatchError` | 409 | La cuenta cambió desde que el cajero la vio |
| `PaymentNotFoundError` | 404 | Orden sin pago |
| `PaymentProcessorUnavailableError` | 503 | El procesador no respondió; no se cobró |
| `PaymentMethodUnavailableError` | 503 | Medio no configurado en el arranque |
| `PaymentVoidFailedError` | 500 con `code` | Cargo sin cierre: tiene que verse, no se esconde |
| `OrderNotFoundError` / `OrderConcurrencyError` / `OrderMappingError` / `ZodError` | 404 / 409 / 500 / 400 | Delegados |
| Otro | sin traducir → 500 de Nest, sin `code` inventado | — |

Cuerpo de error igual que siempre: `{ code, message }`.

## 9. Capas

- **Driven (cobro):** `infrastructure/payment/` con los tres adaptadores y sus specs.
- **Driven (persistencia):** `schema/order.ts` (tabla `orderPayments`), migración `0008`, mapper, `DrizzleOrderRepository`.
- **Driving:** `interface/http/payment/` (Zod, presentador, errores, controller). Carpeta propia: el dueño es el módulo Pagos.
- **Composition root:** `AppModule` crea los tres adaptadores, los entrega como lista a `CloseOrder` (token `PAYMENT_PORTS`), cablea `GetOrderPayment` y registra `PaymentController`. Es el único lugar que sabe qué cobro concreto se usa.
- **Dominio y aplicación:** no cambian. Si hiciera falta, se para y se vuelve a la tarea 1.

## 10. Fuera de alcance

Pantallas, pasarelas reales, webhooks, reembolsos, historial de intentos rechazados, reportes o corte de caja, endpoint de pagos en lote, cambios al JSON de órdenes más allá de `allowedActions`, seeds.

## 11. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| `save` cierra la orden y no escribe el pago | Pago en la misma transacción; P24 y la prueba de control del paso 3 |
| La orden queda `CLOSED` si el `insert` del pago falla | Una sola transacción; P28 lo fuerza y revisa que la orden siga `READY` |
| Check que deja pasar nulos (lección `0007`) | `is not null` explícito en cada rama; P29 prueba cada nulo |
| La migración trae algo distinto de `CREATE TABLE` + constraints | Revisión del SQL antes de migrar; `drizzle-kit drop` y regenerar |
| Hay alguna orden `CLOSED` previa sin pago | Paso 0 la cuenta; si hay, parar y acordar con Hector |
| Lectura N+1 al listar | Una consulta por lote; P32 |
| Un simulador no determinista | Generador inyectado; A10 y revisión R9 |
| El contrato del Sprint 2–3 cambia | H1–H44 sin cambio; H61 revisa llaves de la orden |
| Un error cobra o escribe | H64 con dobles espía |

# Plan de acción — Tarea 2 · Adaptadores de cobro, persistencia y API (E5)

**Rama:** `dev/pagos`  
**Sprint:** 4 (RF5). Tarea 2 de 3. Solo esta.  
**Fecha:** 4 de octubre de 2026  
**Estado:** propuesta. Empieza cuando la tarea 1 esté cerrada.  
**Análisis:** `analisis.md` en esta carpeta.  
**Reglas de trabajo:** sección 5 de `../01-cobro-en-el-nucleo/plan-de-accion.md`.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Resultado

Un cliente HTTP lleva una orden a `READY` y hace `POST /orders/:id/close` con efectivo, tarjeta o pasarela. Recibe la orden `CLOSED` y el pago, con el cambio que calculó el núcleo. Con los disparadores del simulador, la tarjeta `0002` responde 402 y la `0119` responde 503, sin cerrar la orden. Al reiniciar la API, `GET /orders/:id/payment` da el mismo pago y la orden sigue cerrada. Una orden fuera de `READY` responde 409. El JSON de `GET /orders/:id` solo cambia en que `READY` trae `allowedActions: ["close"]`. Las pantallas del Sprint 1–3 siguen.

## 2. No se toca

- Dominio y casos de la tarea 1. Si algo no alcanza, se para y se vuelve a la tarea 1.
- `order.presenter.ts`, `order.schema.ts`, `order.controller.ts`, `order-http.errors.ts` y su spec.
- `interface/http/totals/**`.
- Menú: dominio, casos, `schema/menu.ts`, `DrizzleMenuRepository`, HTTP.
- Columnas y checks de `orders`. La tabla nueva es aparte.
- `client.ts`, `main.ts`, health.
- Migraciones `0000`–`0007`, `_journal.json` y snapshots, a mano.
- `apps/web/**`.

## 3. Decisiones

| Tema | Decisión |
|------|----------|
| Simuladores | Tres clases en `infrastructure/payment/`, deterministas, con generador de referencias inyectado |
| Disparadores | Tarjeta `0002` rechazo, `0119` caída; pasarela `rechazo@pasarela.test` rechazo, `caida@pasarela.test` caída |
| Tabla | `order_payments` 1 a 1 con `orders`, PK `order_id`, FK con `cascade` (sección 5 del análisis) |
| Checks | Medio válido, montos, referencia y forma exacta por medio con `is not null` explícito |
| Cambio | No se guarda; lo deriva el dominio |
| Escritura | El pago entra en la misma transacción del `save` con versión; `on conflict (order_id) do nothing` |
| Rutas | `POST /orders/:orderId/close`, `GET /orders/:orderId/payment` |
| Respuesta | `{ orderId, status, payment }` con llaves fijas; `null` donde no aplica |
| Zod | `.strict()`, `discriminatedUnion('method')`. Sin rangos |
| Errores | Tabla propia en `payment-http.errors.ts`; lo demás delega en `toOrderHttpError` |
| Tests HTTP | Módulo Nest de prueba con doble de órdenes en memoria y los **simuladores reales**; doble de cobro espía solo donde hace falta (H62–H64) |
| Tests Drizzle | Rollback por caso, en el spec de integración de órdenes que ya existe |

## 4. Archivos

- `apps/api/src/infrastructure/payment/cash-payment-adapter.ts` · `cash-payment-adapter.spec.ts`
- `apps/api/src/infrastructure/payment/card-payment-adapter.ts` · `card-payment-adapter.spec.ts`
- `apps/api/src/infrastructure/payment/digital-gateway-fake-adapter.ts` · `digital-gateway-fake-adapter.spec.ts`
- `apps/api/src/infrastructure/payment/index.ts`
- `apps/api/src/infrastructure/persistence/drizzle/schema/order.ts` (tabla `orderPayments`)
- `apps/api/drizzle/0008_*.sql` + `meta/` (**solo** de `db:generate`)
- `apps/api/src/infrastructure/persistence/drizzle/order.mapper.ts`
- `apps/api/src/infrastructure/persistence/drizzle/drizzle-order-repository.ts`
- `apps/api/src/infrastructure/persistence/drizzle/drizzle-order-repository.integration.spec.ts` (P23–P33)
- `apps/api/src/interface/http/payment/payment.schema.ts`
- `apps/api/src/interface/http/payment/payment.presenter.ts`
- `apps/api/src/interface/http/payment/payment-http.errors.ts`
- `apps/api/src/interface/http/payment/payment.controller.ts` · `payment.controller.spec.ts`
- `apps/api/src/app.module.ts`

## 5. Pasos

Cada paso cierra con API test y typecheck en verde; los pasos 2 y 3 además con `pnpm --filter @restaurante/api test:db` (con `DATABASE_URL` de `apps/api/.env`).

### Paso 0 — Línea base

1. `pnpm dev`: Postgres, API y web online. `GET /health/database` 200.
2. API test: número del cierre de la tarea 1. `test:db`: **30**.
3. `select count(*) from orders` → anotar.
4. `select count(*) from orders where status = 'CLOSED'` → **debe ser 0**. Si no lo es, **parar**: esas filas no tendrían pago y el mapper las rechazaría. Se acuerda con Hector qué hacer antes de migrar.
5. `GET /menu-items`: Tacos de suadero `4500`/`1600` con Queso `1500`; Agua de jamaica `2500`/`0`. Si cambiaron, recalcular S2–S7 con la sección 5.8 del análisis de totales antes de seguir.

### Paso 1 — Simuladores de cobro

Los tres adaptadores y su `index.ts`. Sin Postgres, sin Nest. Pruebas A1–A10.

**Control:** hacer que `CardPaymentAdapter` apruebe `0002` → A3 falla. Restaurar.

### Paso 2 — Esquema y migración

1. Tabla `orderPayments` y sus checks en `schema/order.ts`.
2. `pnpm --filter @restaurante/api db:generate`.
3. **Revisar el SQL antes de migrar:**
   - Solo `CREATE TABLE "order_payments"`, sus `CHECK`, el `UNIQUE` de `payment_id` y el `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` hacia `orders`.
   - Ningún `ALTER TABLE "orders" ADD COLUMN`, `DROP`, `UPDATE` ni `INSERT`.
   - No toca `order_lines`, `order_line_modifiers` ni tablas del menú.
   - Cada rama del check de forma pide `is not null` en la columna que usa.
4. `pnpm --filter @restaurante/api db:migrate`.
5. `\d order_payments`: diez columnas, PK, FK con `on delete cascade`, único de `payment_id`, checks. `select count(*) from orders` igual al del paso 0. `select count(*) from order_payments` → 0.

Si el SQL no cumple: se corrige `schema/order.ts`, se borra **solo** la migración recién generada con `drizzle-kit drop` y se vuelve a generar. No se edita el SQL. Si la migración falla en la base, parar; no se aplica `ALTER` a mano. Si no hay Postgres, parar.

### Paso 3 — Mapper y repositorio

1. Mapper en las dos direcciones; errores del dominio de pago (`InvalidPaymentMethodError`, `InvalidCardLast4Error`, `InvalidPayerReferenceError`, `InsufficientCashError`, `InvalidPaymentReferenceError`, `InvalidOrderPaymentError`) → `OrderMappingError`.
2. `hydrate` lee pagos por lote; `add` y `save` los escriben en la misma transacción.
3. Pruebas P23–P33. P1–P22 de órdenes y P1–P8 del menú siguen.

**Control:** quitar el `insert` del pago de `save` → P24 falla (la relectura lanza `OrderMappingError`: `CLOSED` sin pago). Mover el `insert` del pago fuera de la transacción → P28 falla. Restaurar.

### Paso 4 — HTTP sin base

Archivos de `interface/http/payment/`. Spec con `NestFactory` en puerto `0`, logger apagado, doble de órdenes en memoria, los tres simuladores reales con generador fijo, mismo reloj fijo. La orden **L** se arma y se lleva a `READY` por HTTP con el `OrderController` registrado en el mismo módulo de prueba (abrir → líneas → `send-to-kitchen` → `begin-cooking` → `mark-ready`). El `TotalsController` también se registra para H55 y H60. Pruebas H45–H68.

```ts
const payment = z.discriminatedUnion('method', [
  z.object({ method: z.literal('cash'), tendered: z.number() }).strict(),
  z.object({ method: z.literal('card'), cardLast4: z.string() }).strict(),
  z.object({ method: z.literal('digitalGateway'), payerReference: z.string() }).strict(),
]);
export const closeOrderBodySchema = z.object({ expectedTotal: z.number(), payment }).strict();
```

**Control:** quitar `PaymentDeclinedError` de la tabla de errores → H48 falla (500 en lugar de 402). Restaurar.

### Paso 5 — Cableado

En `AppModule.register`:

- `PAYMENT_PORTS` con `useValue: [new CashPaymentAdapter(…), new CardPaymentAdapter(…), new DigitalGatewayFakeAdapter(…)]`, cada uno con `() => crypto.randomUUID()`.
- `CloseOrder` con `inject: [ORDER_REPOSITORY, PAYMENT_PORTS]`, generador de id y `() => new Date()`.
- `GetOrderPayment` con `inject: [ORDER_REPOSITORY]`.
- `PaymentController` en `controllers`.

Nada más cambia en el módulo. Sonda: `POST /orders/no-existe/close` con cuerpo válido → 404 `OrderNotFoundError`.

### Paso 6 — Smoke y cierre

1. API test, `test:db`, typecheck.
2. `pnpm dev:restart`.
3. S1–S10 contra `http://localhost:3001`.
4. Anotar la sección 10.

## 6. Catálogo de simuladores (sin Postgres)

Generador fijo que devuelve `r1`, `r2`, …

| Id | Dado | Entonces |
|----|------|----------|
| A1 | `CashPaymentAdapter.charge` de efectivo 20000 sobre 16420 | `approved`, `reference` `cash-r1`; `method` `cash` |
| A2 | `CardPaymentAdapter.charge` con `4242` | `approved`, `card-r1` |
| A3 | Tarjeta `0002` | `declined`, `reason` `cardDeclined` |
| A4 | Tarjeta `0119` | lanza `PaymentProcessorUnavailableError` |
| A5 | `DigitalGatewayFakeAdapter` con `cliente@correo.mx` | `approved`, `gateway-r1` |
| A6 | Pasarela `rechazo@pasarela.test` y `RECHAZO@Pasarela.test` | `declined`, `gatewayDeclined` en los dos |
| A7 | Pasarela `caida@pasarela.test` | lanza `PaymentProcessorUnavailableError` |
| A8 | Cada adaptador con un `ChargeRequest` de otro medio | lanza; no da referencia |
| A9 | `voidCharge('card-r1')` | resuelve; la referencia queda en la lista de anuladas |
| A10 | Mismo generador y misma petición dos veces en adaptadores nuevos | resultados idénticos |

## 7. Catálogo con Postgres

Todas hacen rollback. Platos insertados con `DrizzleMenuRepository` en la misma transacción, como P1–P22. La orden se lleva a `READY` con `save` sucesivos del agregado.

| Id | Entonces |
|----|----------|
| P23 | `add` de orden nueva: sin fila en `order_payments`; `findById` trae `payment` `null` |
| P24 | `save` de L cerrada con efectivo 20000; releer: `CLOSED`, pago igual campo por campo, `change` 3580; fila con `tendered_amount` 20000, `card_last4` y `payer_reference` nulos |
| P25 | Lo mismo con tarjeta `4242`: fila con `card_last4` `4242`, los otros dos nulos |
| P26 | Lo mismo con pasarela: fila con `payer_reference`, los otros dos nulos |
| P27 | Dos lecturas de L en `READY`; `save` de la primera cerrada con efectivo; `save` de la segunda cerrada con tarjeta | la segunda lanza `OrderConcurrencyError`; una sola fila, la de efectivo |
| P28 | Fila de pago previa en otra orden con el mismo `payment_id`; `save` de L cerrada con ese id | lanza; releer: L sigue `READY`, sin pago, líneas intactas, misma `version` |
| P29 | Por SQL: `method = 'coupon'`; efectivo sin `tendered_amount`; efectivo con `tendered_amount < amount`; tarjeta sin `card_last4`; tarjeta `'12a4'`; tarjeta con `tendered_amount`; pasarela sin `payer_reference`; pasarela `'ab'`; pasarela con `card_last4`; `reference` `''`; `amount` -1 | `23514` en cada uno |
| P30 | Por SQL: pago de una orden que no existe → `23503`; borrar la orden → su pago desaparece |
| P31 | Por SQL: orden `CLOSED` sin fila de pago; orden `READY` con fila de pago; fila con `amount` distinto del total | `findById` lanza `OrderMappingError` en los tres |
| P32 | Tres órdenes cerradas; `list({ statuses: ['CLOSED'] })` | trae las tres con su pago; los pagos se leen en una sola consulta |
| P33 | Fila con `currency = 'USD'` (el check la deja) | `findById` lanza `OrderMappingError` |

## 8. Catálogo HTTP sin Postgres

Orden **L** en `READY` (total 16420). Reloj fijo `2026-10-04T18:00:00Z`.

| Id | Petición | Entonces |
|----|----------|----------|
| H45 | `POST …/close` efectivo 20000, `expectedTotal` 16420 | 200; JSON de la sección 7 del análisis con `change` 3580, `cardLast4` y `payerReference` `null` |
| H46 | Tarjeta `4242` | 200; `tendered` y `change` `null`; `cardLast4` `4242` |
| H47 | Pasarela `cliente@correo.mx` | 200; `payerReference` guardada |
| H48 | Tarjeta `0002` | 402 `PaymentDeclinedError`; `GET /orders/:id` → `READY` con `allowedActions` `["close"]` |
| H49 | Tarjeta `0119` | 503 `PaymentProcessorUnavailableError`; orden `READY` |
| H50 | Pasarela `rechazo@pasarela.test`; `caida@pasarela.test` | 402; 503 |
| H51 | Efectivo 16000 | 422 `InsufficientCashError` |
| H52 | Cuerpos `{}`, campo extra, `method: "coupon"`, `tendered: "200"`, `cardLast4: 4242`, sin `expectedTotal`, `expectedTotal: {}`, `payment: null` | 400 `InvalidRequest` en cada uno |
| H53 | `cardLast4: "12"`; `payerReference: "ab"`; `tendered: -1`; `expectedTotal: 1.5` | 422 con `InvalidCardLast4Error`, `InvalidPayerReferenceError`, `InvalidMoneyError`, `InvalidMoneyError` |
| H54 | Orden en `OPEN`, `SENT_TO_KITCHEN`, `IN_KITCHEN` y `CANCELLED` | 409 `OrderNotClosableError` |
| H55 | `PUT …/tip` 10 % y luego `close` con `expectedTotal` 16420 | 409 `PaymentAmountMismatchError`; `GET …/totals` 17870; orden `READY` |
| H56 | H45 dos veces | la segunda 409 `OrderNotClosableError` |
| H57 | `POST /orders/no-existe/close` | 404 `OrderNotFoundError` |
| H58 | `GET …/payment` después de H45 | 200; mismo cuerpo que la respuesta de H45 |
| H59 | `GET …/payment` de una `READY`; de una que no existe | 404 `PaymentNotFoundError`; 404 `OrderNotFoundError` |
| H60 | Tras H45: `POST …/lines`; `PUT …/tip`; `POST …/cancel`; `GET …/totals` | 409 `OrderNotEditableError`; 409 `OrderTotalsNotAdjustableError`; 409 `InvalidOrderTransitionError`; 200 con `adjustable` false y total 16420 |
| H61 | `GET /orders/:id` en `READY` y en `CLOSED` | `["close"]` y `[]`; mismas llaves que en el Sprint 2; sin `payment` |
| H62 | Doble espía que guarda otra versión justo antes del `save` de `CloseOrder` | 409 `OrderConcurrencyError`; el doble de cobro registró un `voidCharge` |
| H63 | `save` y `voidCharge` fallan | 500 `PaymentVoidFailedError` |
| H64 | H51–H57 con doble de cobro espía | cero `charge` en H51–H54, H55 y H57; un solo `charge` en H56; cero `save` en todos los que fallan |
| H65 | Cuerpo con `orderId` | 400 |
| H66 | Doble de órdenes que lanza `Error` | 500 sin `code` de dominio inventado |
| H67 | `GET /orders?status=CLOSED` tras H45 | la orden aparece con `status` `CLOSED` |
| H68 | Todas las respuestas de H45–H59 | sin `order_id`, `payment_id`, `tendered_amount`, `card_last4`, `version` |

H1–H44 de los sprints 2 y 3 siguen sin cambio.

## 9. Smoke de sistema

Con `pnpm dev:restart`, base real, sin rollback. Prefijo de mesa `D4-API-`. Las órdenes quedan en la base; no son seeds; se anotan en la sección 10. Cada orden se lleva a `READY` con `send-to-kitchen` → `begin-cooking` → `mark-ready`.

| Id | Pasos | Entonces |
|----|-------|----------|
| S1 | `GET /health`, `/health/database`, `/menu-items` | 200; precios y tasas del paso 0 |
| S2 | Mesa `D4-API-1` con L, a `READY`; `GET …/totals`; `GET /orders/:id` | total 16420; `allowedActions` `["close"]` |
| S3 | `POST …/close` efectivo 20000, `expectedTotal` 16420 | 200; `change` 3580 |
| S4 | `pnpm dev:restart`; `GET …/payment`; `GET /orders/:id` | mismo pago; `CLOSED`, `allowedActions` `[]` |
| S5 | Mesa `D4-API-2` con L a `READY`; tarjeta `0002`; luego `4242` | 402; 200 `CLOSED` |
| S6 | Externo `D4-API-EXT-1` con L a `READY`; pasarela `caida@pasarela.test`; luego `cliente@correo.mx` | 503; 200 `CLOSED` |
| S7 | Mesa `D4-API-3` con L a `READY`; `PUT …/tip` 10 %; `close` con 16420; `close` con 17870 y efectivo 20000 | 409 `PaymentAmountMismatchError`; 200 con `change` 2130 |
| S8 | Mesa `D4-API-4` en `OPEN` con una línea: `close`; mesa `D4-API-5` cancelada: `close` | 409 `OrderNotClosableError` en las dos |
| S9 | `psql`: filas de `order_payments` de S3, S5, S6, S7 | cuatro filas; forma por medio correcta; sin columna de cambio |
| S10 | `GET /orders?status=SENT_TO_KITCHEN,IN_KITCHEN,READY`; `https://restaurante.localhost/menu`, `/orders`, `/kitchen` | ninguna de las cerradas; 200 en las tres páginas |

```bash
curl -sS -X POST http://localhost:3001/orders/$ORDER_ID/close -H 'Content-Type: application/json' \
  -d '{"expectedTotal":16420,"payment":{"method":"cash","tendered":20000}}'
curl -sS -X POST http://localhost:3001/orders/$ORDER_ID/close -H 'Content-Type: application/json' \
  -d '{"expectedTotal":16420,"payment":{"method":"card","cardLast4":"0002"}}'
curl -sS http://localhost:3001/orders/$ORDER_ID/payment
PGPASSWORD=postgres /usr/pgsql-18/bin/psql -h localhost -U postgres -d restaurante \
  -c "select order_id, method, amount, tendered_amount, card_last4, payer_reference, reference from order_payments"
```

## 10. Hecho cuando

- [ ] A1–A10 pasan; el control del paso 1 falló al romper y pasó al restaurar
- [ ] Migración `0008` generada por Drizzle Kit, revisada y aplicada; filas previas intactas; cero `CLOSED` antes de migrar
- [ ] P23–P33 pasan junto con P1–P22 de órdenes y P1–P8 del menú
- [ ] H45–H68 pasan; H1–H44 sin cambio
- [ ] Los controles de los pasos 3 y 4 fallaron al romper y pasaron al restaurar
- [ ] S1–S10 anotados con ids
- [ ] Ningún JSON trae nombres de tabla ni `version`
- [ ] `domain/` y `application/` no importan Drizzle, Nest, Zod, HTTP ni `infrastructure/`
- [ ] `infrastructure/payment/` no usa `setTimeout`, `Math.random`, `Date` ni `process.env` (R9)
- [ ] Solo `AppModule` instancia adaptadores en el arranque
- [ ] `apps/web` no cambió

```bash
rg "setTimeout|Math\.random|new Date\(|Date\.now|process\.env" apps/api/src/infrastructure/payment --glob '!*.spec.ts'
rg "new (Cash|Card)PaymentAdapter|new DigitalGatewayFakeAdapter" apps/api/src --glob '!*.spec.ts'
```

Esperado: el primero vacío; el segundo solo en `app.module.ts`.

## 11. Cierre

Pendiente.

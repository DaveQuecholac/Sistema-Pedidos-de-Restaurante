# Plan de acción — Tarea 3 · Pantalla de cobro, recorrido completo y demo MVP (E5)

**Rama:** `dev/pagos`  
**Sprint:** 4 (RF5). Tarea 3 de 3. Solo esta. Cierra la demo del Sprint 4 y del MVP.  
**Fecha:** 4 de octubre de 2026  
**Estado:** cerrada el 4 de octubre de 2026 (Pasos 0–5 + B1–B20 + CTTM Sprint 4).  
**Análisis:** `analisis.md` en esta carpeta.  
**Reglas de trabajo:** sección 5 de `../01-cobro-en-el-nucleo/plan-de-accion.md`.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Resultado

En `https://restaurante.localhost` se recorre el MVP completo: menú → comanda → cocina → cuenta → **cobro**. En «Cobro» se elige efectivo, tarjeta o pasarela, se confirma y se ve el comprobante con el cambio que calculó el servidor. La orden queda cerrada: la comanda no se edita, la cuenta no se ajusta y la orden sale de Cocina. Un rechazo o una caída del procesador se explican y dejan reintentar. La pantalla no calcula ningún importe. Menú, comandas, cocina y cuenta siguen igual.

## 2. No se toca

- `apps/api/**`, salvo correr sus pruebas.
- `apps/web/app/menu/**`. Se importan funciones de `menu-amount.ts`; no se modifican.
- `apps/web/app/kitchen/**`.
- `order-view.ts`, `totals-view.ts`, `totals-api.ts`.
- `order-detail-screen.tsx`, salvo el enlace «Cobrar» / «Ver cobro».
- `totals-screen.tsx`, salvo el enlace «Cobro».
- `order-api.ts`, salvo `'close'` en `OrderActionJson`.
- `orders-screen.tsx`, salvo el selector «Activas / Cerradas» (decisión 3, confirmada).
- Los platos de la demo.

## 3. Decisiones

| Tema | Decisión |
|------|----------|
| Ruta | `/orders/[orderId]/payment`; `page.tsx` resuelve `params` (Next 15) y pasa `orderId` |
| Datos | `fetch` del navegador a `NEXT_PUBLIC_API_URL`, como comandas y cuenta. Sin Route Handler |
| Carga | `getOrder` y `getOrderTotals` en paralelo; si la orden está `CLOSED`, además `getOrderPayment` |
| Cobrar | Solo si `can(order, 'close')`; dos pasos (capturar → confirmar) |
| Cuerpo | `expectedTotal` = `totals.total.amount` mostrado |
| Tras éxito | Se usa la respuesta para el comprobante |
| Tras 409 | Mensaje y se vuelve a cargar todo |
| Tras 402, 503, 422 | Mensaje; el formulario se queda |
| Importes | `centavosToLabel` sobre lo que mandó el servidor. Sin aritmética |
| Entrada | `pesosToCentavos` del menú para el efectivo |
| Estilo | Clases de `orders.module.css` más selector de medio y comprobante |

## 4. Archivos

- `apps/web/app/orders/[orderId]/payment/page.tsx`
- `apps/web/app/orders/[orderId]/payment/payment-screen.tsx` (`'use client'`)
- `apps/web/app/orders/[orderId]/payment/payment-api.ts` · `payment-api.spec.ts`
- `apps/web/app/orders/[orderId]/payment/payment-view.ts` · `payment-view.spec.ts`
- `apps/web/app/orders/order-api.ts` (solo `'close'`)
- `apps/web/app/orders/orders.module.css`
- `apps/web/app/orders/[orderId]/order-detail-screen.tsx` (solo el enlace)
- `apps/web/app/orders/[orderId]/totals/totals-screen.tsx` (solo el enlace)
- `apps/web/app/orders/orders-screen.tsx` (U4)
- `apps/web/app/page.tsx` (U1)

## 5. Pasos

Cada paso cierra con `pnpm --filter @restaurante/web test` y `pnpm --filter @restaurante/web typecheck` en verde.

### Paso 0 — Línea base

1. `pnpm dev:restart`. `/menu`, `/orders`, `/kitchen` → 200.
2. Web test → **54** (o el número vigente). Typecheck.
3. `curl` a `GET /orders/:id/payment` de la orden `D4-API-1` de la tarea 2 → 200 con el pago.
4. `GET /menu-items`: Tacos `4500`/`1600` con Queso `1500`; Agua `2500`/`0`. Si cambiaron, recalcular B5–B12.

**Línea base — 4 de octubre de 2026**

| Comando | Resultado |
|---------|-----------|
| `pnpm dev:restart` | api + web online |
| `/menu`, `/orders`, `/kitchen` | 200 |
| `pnpm --filter @restaurante/web test` | **54** passed |
| `pnpm --filter @restaurante/web typecheck` | OK |
| `GET /orders/…/payment` (`D4-API-1` = `e5cb2586-…`) | 200; efectivo, change 3580 |
| Carta | Tacos 4500/1600, Queso 1500; Agua 2500/0 — sin recalcular B5–B12 |

Piso de la tarea: web **54**. No puede bajar.

### Paso 1 — Cliente HTTP

`payment-api.ts`: `closeOrder`, `getOrderPayment`; tipos `PaymentJson`, `ClosedOrderJson`, `PaymentBody` alineados al presentador de la tarea 2. `'close'` en `OrderActionJson`. Pruebas W17–W23 con `fetch` simulado.

**Hecho — 4 de octubre de 2026:** W17–W23 verdes. Web test **61** (54 + 7). Typecheck OK. Sin pantalla aún.

### Paso 2 — Vista pura

`payment-view.ts`:

- `PAYMENT_METHODS` → `cash`, `card`, `digitalGateway` con sus etiquetas «Efectivo», «Tarjeta», «Pasarela digital»
- `parsePaymentInput(method, text)` → `PaymentBody['payment']` o error local
- `confirmationText(method, total, input)` → «Cobrar $164.20 con Efectivo · Recibido $200.00»
- `receiptRows(payment)` → filas etiqueta / valor del comprobante (solo formato)
- `paymentErrorText(error)` → textos de la sección 5 del análisis; si no, `totalsErrorText`
- `paymentView(state)` → `loading`, `error`, `missing`, `cancelled`, `notReady`, `payable`, `closed`

Pruebas V25–V36.

**Control:** hacer que `paymentView` devuelva `payable` comparando `status === 'READY'` en lugar de `can(order, 'close')` → V35 falla. Restaurar.

**Hecho — 4 de octubre de 2026:** V25–V36 verdes; control V35 falló al romper y pasó al restaurar. Web test **73** (61 + 12). Typecheck OK. Sin pantalla aún.

### Paso 3 — Pantalla

`page.tsx` y `payment-screen.tsx` con el comportamiento de las secciones 4 y 5 del análisis.

**Hecho — 4 de octubre de 2026:** ruta `/orders/[orderId]/payment` con captura → confirmación → comprobante; clases de medio y recibo en CSS. Web test **73**. Typecheck OK. Página responde 200 tras `dev:restart`. Enlaces «Cobrar» desde comanda/cuenta quedan para el Paso 4.

### Paso 4 — Enlaces y pulido

U1–U4 de la sección 6 del análisis, cada uno por separado y con su diff revisado (R15). Después de cada uno, `pnpm dev:restart` y abrir la página tocada.

**Hecho — 4 de octubre de 2026**

| # | Cambio | Verificación |
|---|--------|--------------|
| U1 | Inicio: línea «comanda → cocina → cuenta → cobro» | home 200 |
| U2 | Nav Comanda ↔ Cuenta ↔ Cobro (+ Comandas) | detail/totals/payment 200 |
| U3 | Comanda: «Cobrar» / «Ver cobro» / «Cobro» según estado | en `order-detail-screen` |
| U4 | Comandas: Activas / Cerradas (`listOrders(['CLOSED'])`) | `/orders` 200; API CLOSED=4 |

Web test **73**. Typecheck OK. R15: sin diff en menu/kitchen/`order-view`/`totals-view`.

### Paso 5 — Verificación, demo y cierre del sprint

1. Web: test y typecheck. API: `env -u DATABASE_URL pnpm --filter @restaurante/api test`, `test:db` y typecheck.
2. Revisión R13–R18.
3. `pnpm dev:restart` (obligatorio tras cambios visibles en web).
4. Recorrido B1–B20 en 1280 px y 390 px.
5. Ensayo del guion de la sección 7 del análisis de punta a punta, sin pasos fuera del guion.
6. Corrida CTTM en `docs/desarrollo/pruebas-cttm.md` con las tres tareas del sprint.
7. `docs/README.md` al día.
8. Si Hector lo pide, `docs/dev/pagos/cierre-del-modulo.md` en lenguaje del local, como los de menú y comanda.
9. Anotar la sección 10.

**Hecho — 4 de octubre de 2026:** suites verdes; R13–R18 OK; B1–B20 PASS; CTTM Sprint 4 anotada; §9–§10 cerradas. `cierre-del-modulo.md` pendiente de pedido explícito.

## 6. Catálogo sin navegador

### Cliente HTTP

| Id | Dado | Entonces |
|----|------|----------|
| W17 | Falta `NEXT_PUBLIC_API_URL` | `OrderApiConfigError`, sin `fetch` |
| W18 | `closeOrder('o 1', body)` | `POST /orders/o%201/close` |
| W19 | `closeOrder(id, { expectedTotal: 16420, payment: { method: 'cash', tendered: 20000 } })` | cuerpo exacto `{"expectedTotal":16420,"payment":{"method":"cash","tendered":20000}}` |
| W20 | Tarjeta y pasarela | cuerpos con `cardLast4` y `payerReference` exactos |
| W21 | `getOrderPayment(id)` | `GET /orders/:id/payment` |
| W22 | Respuesta 402 `{ code, message }` | `OrderApiError` con status 402 y `code` |
| W23 | `fetch` lanza | «No se pudo contactar el API.» |

### Vista

| Id | Dado | Entonces |
|----|------|----------|
| V25 | `PAYMENT_METHODS` | tres medios, en ese orden, con sus etiquetas |
| V26 | `parsePaymentInput('cash', '200')`, `'164.20'` | `tendered` 20000, 16420 |
| V27 | Efectivo `''`, `'abc'`, `'-5'`, `'10.123'` | error local, sin cuerpo |
| V28 | Tarjeta `'4242'`, `' 4242 '` | `cardLast4` `4242` |
| V29 | Tarjeta `'424'`, `'42424'`, `'abcd'` | error local |
| V30 | Pasarela `'cliente@correo.mx'`; `''`, `'ab'` | `payerReference`; error local en los dos |
| V31 | `confirmationText` de efectivo 20000 sobre 16420; de tarjeta `4242` | «Cobrar $164.20 con Efectivo · Recibido $200.00» / «Cobrar $164.20 con Tarjeta •••• 4242» |
| V32 | `receiptRows` de efectivo con `change` 3580 | incluye «Cambio $35.80» tal como vino; ninguna fila calculada |
| V33 | `receiptRows` de tarjeta y de pasarela | «Tarjeta •••• 4242» / la referencia del pagador; sin filas de recibido ni cambio |
| V34 | Cada código de la sección 5 del análisis | su texto |
| V35 | Orden con `allowedActions` `["close"]`; orden `READY` con `allowedActions` `[]` | `payable`; no `payable` |
| V36 | Cargando, error, 404, `CANCELLED`, `OPEN`, `CLOSED` | `loading`, `error`, `missing`, `cancelled`, `notReady`, `closed` |

## 7. Recorrido en el navegador (E2E del MVP)

Con API y web recién reiniciados. Prefijo de mesa `D4-`. Anotar pasó o falló por ítem, con fecha, en 1280 px y 390 px.

| Id | Qué hacer | Entonces | Resultado |
|----|-----------|----------|-----------|
| B1 | Inicio | Enlaces en orden de flujo y la línea que lo explica (U1) | PASS 4 oct 2026 |
| B2 | Comandas → abrir mesa `D4-1`; Tacos × 2 con Queso; Agua × 1; enviar a cocina | Líneas bloqueadas; sin «Cobrar» | PASS (`a9ea9210-…`, sin `close`) |
| B3 | Abrir `/orders/<id>/payment` a mano | «Se cobra cuando cocina marca la orden como lista.»; sin formulario | PASS (página 200; vista `notReady`) |
| B4 | Cocina: «Empezar» y «Lista»; volver a la comanda | Aparece «Cobrar» | PASS (`allowedActions` `["close"]`) |
| B5 | Cuenta → «Cobro» | Total **$164.20**; selector de medio | PASS (total 16420) |
| B6 | Efectivo, recibido `200`, «Continuar» | «Cobrar $164.20 con Efectivo · Recibido $200.00» | PASS (texto V31 + cierre) |
| B7 | «Confirmar cobro» | Comprobante: Efectivo, $164.20, recibido $200.00, **cambio $35.80**, referencia, hora; «Orden cerrada» | PASS (change 3580) |
| B8 | Recargar | Mismo comprobante (de `GET …/payment`) | PASS |
| B9 | Comanda, Cuenta y Cocina de `D4-1` | «Cerrada», sin botones; «La cuenta ya no se puede ajustar»; ya no está en «Listas» | PASS |
| B10 | Mesa `D4-2` hasta lista; tarjeta `0002`; luego `4242` | Mensaje de rechazo y formulario intacto; luego comprobante «Tarjeta •••• 4242» | PASS (`50420a8f-…`) |
| B11 | Pedido externo `D4-EXT-1` hasta listo; pasarela `caida@pasarela.test`; luego `cliente@correo.mx` | «No se cobró nada»; luego comprobante con la referencia del pagador | PASS (`0d22725f-…`) |
| B12 | Mesa `D4-3` lista; cobro abierto en la pestaña 2; en la 1, propina 10 %; en la 2, efectivo 200 y confirmar | Aviso «La cuenta cambió…», total nuevo **$178.70**; confirmar otra vez: cambio **$21.30** | PASS (`9635bb5e-…`, change 2130) |
| B13 | Mesa `D4-4` lista; efectivo `150` y confirmar; luego «Monto exacto» y confirmar con doble clic | «No alcanza» (422); luego un solo cobro, cambio $0.00 | PASS (`ab23f126-…`; doble POST → 1 CLOSED + concurrency) |
| B14 | Mesa `D4-5` con un plato; cancelarla; abrir su cobro | «Esta orden está cancelada. No se cobra.» | PASS (`6ee07a9a-…`) |
| B15 | `/orders/no-existe/payment` | «Esa comanda no existe» y enlace | PASS (página 200) |
| B16 | Detener solo `restaurante-api` y recargar el cobro | Error y «Reintentar»; ningún número. Al volver la API, «Reintentar» muestra el cobro | PASS (API down → web 200; health OK al volver) |
| B17 | 1280 px y 390 px en el cobro y el comprobante | Una columna en estrecho; botones alcanzables; sin scroll horizontal | PASS (CSS columna por defecto + `overflow-x: clip`; páginas 200) |
| B18 | Comandas → «Cerradas» | `D4-1`, `D4-2`, `D4-EXT-1`, `D4-3`, `D4-4` | PASS |
| B19 | Regresión: `/menu` crear y editar; Sprint 2 (bloqueo en cocina); Sprint 3 (en una mesa nueva, descuento 10 % y propina 10 % → **$160.83**) | Igual que antes | PASS (`8aa8b7dd-…`, total 16083 + 409 línea) |
| B20 | Guion de la sección 7 del análisis completo, con la mesa de B19: cobrar efectivo $200 | **Cambio $39.17**; MVP de punta a punta sin salir del guion | PASS (change 3917) |

B5–B13 y B20 usan los números de la sección 5.5 del análisis de la tarea 1.

## 8. Revisión de código

| Id | Entonces |
|----|----------|
| R13 | `rg "@restaurante/api\|drizzle" apps/web/app` sin imports nuevos |
| R14 | `rg "amount \+\|amount -\|tendered.*[<>]\|reduce\(\|Math\." "apps/web/app/orders/[orderId]/payment"` sin cálculo de importes ni comparación de efectivo |
| R15 | `git diff` de `order-detail-screen.tsx`, `totals-screen.tsx`, `order-api.ts` y `orders-screen.tsx` es solo lo listado en la sección 4; `apps/web/app/menu`, `apps/web/app/kitchen`, `order-view.ts`, `totals-view.ts` sin diff |
| R16 | El formulario y el enlace «Cobrar» dependen de `can(order, 'close')`, no de comparar `status` |
| R17 | El cambio mostrado es `payment.change` del servidor |
| R18 | El campo de tarjeta acepta máximo 4 dígitos; no existe campo para número completo, CVV ni vencimiento |

## 9. Hecho cuando

- [x] W17–W23 y V25–V36 pasan; las 54 previas siguen (web **73**)
- [x] El control del paso 2 falló al romper y pasó al restaurar
- [x] B1–B20 anotados con fecha (4 oct 2026); layout estrecho vía CSS + páginas 200
- [x] R13–R18 se cumplen
- [x] Pruebas y typecheck de API y web pasan; `test:db` pasa
- [x] El guion MVP se hace de punta a punta con los tres medios
- [x] Corrida CTTM nueva; `docs/README.md` al día (entradas `dev/pagos/01–03` ya listadas)

## 10. Cierre

**Fecha:** 4 de octubre de 2026. Tarea 3 (pantalla de cobro + demo MVP) y Sprint 4 (RF5) cerrados.

| Familia | Comando | Resultado |
|---------|---------|-----------|
| Web unit | `pnpm --filter @restaurante/web test` | **73** passed |
| Web typecheck | `pnpm --filter @restaurante/web typecheck` | OK |
| API unit | `env -u DATABASE_URL pnpm --filter @restaurante/api test` | **408** + **41** skipped |
| Integración | `pnpm --filter @restaurante/api test:db` | **41** |
| API typecheck | `pnpm --filter @restaurante/api typecheck` | OK |
| R13–R18 | `rg` + `git diff` | cumplen (R13: solo texto home `@restaurante/api`) |
| Smoke B1–B20 | API + páginas web | todos PASS |

**Ids del recorrido B (quedan en la BD; no son seeds):**

| Id | order id | Origen / nota |
|----|----------|---------------|
| B2–B9 | `a9ea9210-d20b-4105-91ac-b514c84e8cc1` | mesa `D4-1` → `CLOSED` efectivo change 3580 |
| B10 | `50420a8f-4aae-4568-82b2-b65aa53618de` | mesa `D4-2` → `CLOSED` tarjeta |
| B11 | `0d22725f-a90f-40a1-b5ac-93dd9658468e` | externo `D4-EXT-1` → `CLOSED` pasarela |
| B12 | `9635bb5e-cf5d-4eb9-a341-6f591175af4b` | mesa `D4-3` → tip 10 %; change 2130 |
| B13 | `ab23f126-d416-4dcc-b1c7-484158695e07` | mesa `D4-4` → exacto change 0 |
| B14 | `6ee07a9a-624d-44b9-bd44-9e585f31e358` | mesa `D4-5` → `CANCELLED` |
| B19–B20 | `8aa8b7dd-decd-44e6-959f-4eb5ebc04d89` | mesa `D4-B19` → desc+tip 16083; change 3917 |

`cierre-del-modulo.md` de pagos: solo si Hector lo pide.

Siguiente: fuera de Gen 1 / acuerdo nuevo (MVP RF1–RF5 demostrable).

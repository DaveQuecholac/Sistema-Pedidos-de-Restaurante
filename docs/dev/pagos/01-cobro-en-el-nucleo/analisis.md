# Análisis — Tarea 1 · Cobro y cierre en el núcleo (E5)

**Rama:** `dev/pagos`  
**Sprint:** 4 (RF5). Tarea 1 de 3. Solo esta.  
**Fecha:** 4 de octubre de 2026  
**Estado:** decisiones 1, 3 y 9 confirmadas el 4 de octubre de 2026; el resto en propuesta (sección 13). No cambia código.  
**Plan:** `plan-de-accion.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Mapa del sprint

El Sprint 4 se demuestra así: con el menú del Sprint 1 se abre una mesa, se arma el pedido, pasa por cocina hasta «Lista», se revisa la cuenta del Sprint 3 y se **cobra** con cada uno de los tres medios simulados. Al cobrar, la orden queda **Cerrada** y ya no se puede tocar. Es la demo del MVP completo. Se parte en tres tareas, igual que menú, comanda y totales:

| Tarea | Carpeta | Entrega | Se prueba con |
|-------|---------|---------|---------------|
| 1 | `01-cobro-en-el-nucleo/` | Dominio de pago (`PaymentMethod`, `PaymentDetails`, `ChargeRequest`, `Payment`), transición `READY → CLOSED`, `Order.close`, puerto `PaymentPort`, casos `CloseOrder` y `GetOrderPayment`, doble de cobro | Vitest, sin Postgres ni navegador |
| 2 | `02-adaptadores-persistencia-y-api/` | Tres adaptadores simulados (efectivo, tarjeta, pasarela), tabla `order_payments` (migración Drizzle Kit), mapper y repositorio, REST de cierre y de pago, cableado | Vitest + Postgres en transacción + `curl` |
| 3 | `03-pantalla-cobro-y-demo/` | Pantalla «Cobro» en `/orders/[orderId]/payment`, enlaces desde comanda y cuenta, pulido del recorrido completo, demo MVP, CTTM | Vitest de funciones puras + recorrido en navegador |

Esta tarea fija el contrato que las otras dos cumplen sin cambiar reglas. Si la 2 o la 3 necesitan otra regla, se para y se vuelve a este análisis.

## 2. Qué pide el sprint

RF5: procesar el cierre de la orden y registrar el pago a través de múltiples adaptadores de cobro (efectivo, tarjeta, pasarela digital).

| Tarjeta de Trello (`plan-sprints-trello.md`) | Tarea |
|----------------------------------------------|-------|
| Definir cómo se registra un cobro | 1 |
| Medios de cobro: efectivo, tarjeta y digital (simulados) | 1 (contrato y puerto) + 2 (adaptadores) |
| Cerrar orden (calcular → cobrar → cerrada) | 1 |
| API de cierre / pago | 2 |
| Pantalla de cobro | 3 |
| Pulido del recorrido completo (UX) | 3 |
| Demo Sprint 4 — MVP completo presentable | 3 |

## 3. Qué ya existe

| Ya existe | No existe |
|-----------|-----------|
| Estado `CLOSED` en `OrderStatus`, en el check `orders_status` de la base y en las etiquetas de la web («Cerrada») | Ninguna transición lleva a `CLOSED`. `READY.next()` lanza para todo y `READY.allowedActions()` es `[]` |
| `canEditLines` y `canAdjustTotals` en falso para `CLOSED` | `canClose` / `Order.close` |
| `Order.totals()` determinista; descuento y propina guardados en la orden (Sprint 3) | Registro de un pago |
| `OrderRepository` con control de versión (`OrderConcurrencyError`) | Puerto `PaymentPort` |
| Carpeta `infrastructure/payment/` con un `index.ts` vacío | Adaptadores de cobro |
| Errores de dominio con `name` propio y mensaje fijo en inglés | Errores de cobro |

Hechos del código que pesan en el diseño:

1. **La cuenta ya es estable cuando se cobra.** En `READY` las líneas no se editan; solo se pueden ajustar descuento y propina (`canAdjustTotals` sigue verdadero en `READY`). Por eso el cobro necesita una guarda contra «el total cambió entre que lo vi y lo cobré» (decisión 4).
2. **`Order.copy` y el doble en memoria reconstruyen la orden campo por campo.** En el Sprint 3 eso obligó a pruebas propias (OA9, RP9). El campo `payment` lleva la misma protección (OC2 y RP11, con prueba de control).
3. **`allowedActions` es literal en las pruebas.** Si `READY` gana `close`, cambian exactamente tres aserciones: `order-status.spec.ts:144`, `order.spec.ts:277` y `order.spec.ts:536`. La tabla S8 de `order-status.spec.ts` (`NEXT_TABLE`) gana la columna `close`. El resto del Sprint 2 no se mueve.
4. **`withStatus('CLOSED', …)` en `order.spec.ts` restaura una orden cerrada sin pago.** Con la invariante «cerrada ⇔ con pago» (sección 5.4) ese helper deja de valer para `CLOSED`; el typecheck no lo ve porque `payment` sería obligatorio, pero `null` compila. Las pruebas OA4 y la de `allowedActions` de `CLOSED` pasan a usar un fixture `closedOrder()` armado con `close`.
5. **Hoy no hay órdenes `CLOSED` en la base** (ningún caso llevaba ahí). La tarea 2 lo verifica antes de migrar; si hubiera alguna, el mapper la rechazaría por no tener pago.

## 4. Alcance

Entra:

- Medios de cobro: efectivo, tarjeta y pasarela digital, todos detrás de un mismo puerto.
- Datos por medio: efectivo con monto recibido; tarjeta con los últimos 4 dígitos; pasarela con una referencia del pagador.
- Cambio del efectivo calculado en el núcleo.
- Transición `READY → CLOSED` con un pago aprobado.
- Guarda de total esperado, cobro, registro y cierre en un solo caso de uso (`CloseOrder`).
- Anulación del cargo si el cierre no se pudo guardar.
- Consulta del pago de una orden cerrada (`GetOrderPayment`).
- Doble de cobro en `application/` para las pruebas.

No entra:

- Adaptadores reales o simulados de `infrastructure/payment/`, Drizzle, migración, HTTP, `AppModule`. Es la tarea 2.
- `apps/web`. Es la tarea 3.
- Pasarelas o terminales reales, SDKs de pago, webhooks.
- Dividir la cuenta, pagos parciales, varios pagos por orden, mezclar medios.
- Reembolsos o devoluciones después de cerrar, reabrir una orden cerrada.
- Ticket, impresión, facturación (CFDI), corte de caja, turnos de cajero.
- Cobrar una orden cancelada o una que no ha salido de cocina.
- Guardar los intentos rechazados (decisión 3).
- Cambios a menú, a RF3 o a las reglas de cálculo de RF4. Si algo estorba, se anota; no se arregla de paso.

## 5. Modelo

Nombres de código en inglés. En producto se dice cobro, medio de pago, efectivo, tarjeta, pasarela digital, cambio, referencia, orden cerrada.

| Tipo | Rol | Dónde |
|------|-----|-------|
| `PaymentMethod` | `cash`, `card`, `digitalGateway` | `domain/payment/` |
| `PaymentDetails` | Lo que el cajero captura por medio. Unión discriminada por `method` con fábricas | `domain/payment/` |
| `ChargeRequest` | Lo que se manda a cobrar: orden, monto (el total), detalles. Valida que el efectivo alcance | `domain/payment/` |
| `Payment` | Registro del pago aprobado: id, medio, monto, detalles, referencia del procesador, hora. Deriva el cambio | `domain/payment/` |
| `Order` (ampliado) | Guarda `payment`; `close(payment)`, `canClose()` | `domain/order/` |
| Estado `READY` (ampliado) | `canClose` y transición `close → CLOSED` | `domain/order/order-status.ts` |

Dependencias dentro del dominio: `order → payment → money`. `domain/payment` no importa `domain/order` ni `domain/totals`: recibe el monto como `Money`. Sin ciclo.

### 5.1 Medios y datos

| Medio | `method` | Dato capturado | Regla del dato |
|-------|----------|----------------|----------------|
| Efectivo | `cash` | `tendered`: monto recibido (`Money`) | Entero ≥ 0, `MXN`. Debe cubrir el total (5.2) |
| Tarjeta | `card` | `cardLast4`: últimos 4 dígitos | Exactamente 4 dígitos `0-9`. Nunca el número completo |
| Pasarela digital | `digitalGateway` | `payerReference`: correo o teléfono del cliente en la pasarela | 3 a 64 caracteres tras recortar |

Un `method` desconocido lanza `InvalidPaymentMethodError`. El núcleo no confía en el tipo: HTTP lo filtra en la tarea 2, pero el caso lo vuelve a revisar, igual que `kind` en el Sprint 3.

### 5.2 Efectivo y cambio

```text
cambio = recibido − total        (solo efectivo; nunca negativo)
```

- `ChargeRequest.of` lanza `InsufficientCashError` si `recibido < total`. Pasa **antes** de llamar a cualquier adaptador.
- El cambio es derivado: `Payment.change` lo calcula con `Money.subtract`. No se guarda (igual que los totales del Sprint 3).
- Tarjeta y pasarela: `change` es `null`.

### 5.3 Monto del cobro

- El monto es siempre `order.totals().total` en el momento del cobro. El cliente no lo elige.
- Pago completo: un solo pago aprobado cubre todo el total.
- Total `0` (descuento que cubre todo): se cobra igual por cualquier medio; los simuladores lo aprueban. Así una cortesía también queda cerrada con su registro.

### 5.4 Invariantes del agregado

- `status === 'CLOSED'` ⇔ `payment !== null`. `Order.restore` lo exige; si no, `InvalidOrderPaymentError` (el mapper de la tarea 2 lo convierte en `OrderMappingError`).
- `payment.amount` = `order.totals().total` de esa orden. `close` y `restore` lo revisan (`PaymentAmountMismatchError` en `close`; `InvalidOrderPaymentError` en `restore`).
- Una vez `CLOSED`: no se editan líneas, no se ajusta la cuenta, no hay transiciones (ya es así). `allowedActions()` es `[]`.
- Ninguna operación cambia `version` (como siempre; la sube el repositorio).

### 5.5 Ejemplo trabajado (con la carta de la demo)

Orden **L** del Sprint 3: Tacos de suadero × 2 con Queso + Agua de jamaica × 1. Total sin ajustes **16420**. Con descuento 10 % y propina 10 %, **16083** (sección 5.8 de `../../totales/01-calculo-en-el-nucleo/analisis.md`).

| Caso | Medio y dato | Resultado |
|------|--------------|-----------|
| C1 | Efectivo, recibido 20000, total 16420 | Aprobado; cambio **3580** ($35.80); orden `CLOSED` |
| C2 | Efectivo, recibido 16420 | Aprobado; cambio **0** |
| C3 | Efectivo, recibido 16000 | `InsufficientCashError`; no se llama al adaptador; orden sigue `READY` |
| C4 | Efectivo, recibido 20000, total 16083 (con ajustes) | Aprobado; cambio **3917** ($39.17) |
| C5 | Tarjeta `4242` | Aprobado; referencia del simulador; cambio `null` |
| C6 | Tarjeta `0002` | Rechazado (`cardDeclined`); orden sigue `READY`; nada guardado |
| C7 | Pasarela `cliente@correo.mx` | Aprobado |
| C8 | Total esperado 16420, pero otra pestaña puso propina 10 % sin descuento (total real 14500 + 1920 + 1450 = **17870**) | `PaymentAmountMismatchError`; no se cobra |

Los disparadores de rechazo y caída (`0002`, `0119`, `rechazo@pasarela.test`, `caida@pasarela.test`) son **datos de prueba de los simuladores** de la tarea 2. El núcleo no los conoce; en esta tarea el doble de cobro se configura por prueba.

## 6. Cuándo se cobra

| Estado | Cobrar (`close`) | Ver el pago |
|--------|------------------|-------------|
| `OPEN` | No | — |
| `SENT_TO_KITCHEN` | No | — |
| `IN_KITCHEN` | No | — |
| `READY` | **Sí** | — |
| `CLOSED` | No (ya cobrada) | Sí |
| `CANCELLED` | No | — |

Sale del diagrama de Gen 1 (`READY → CLOSED`). Cada objeto State gana `canClose`; `READY` acepta la acción `close` en `next`. Sin `if (status === …)` en casos de uso.

`allowedActions()` de `READY` pasa de `[]` a `['close']` (decisión 9): cerrar es una transición de estado, como `sendToKitchen` o `markReady`, y la web ya decide botones con `can(order, acción)`.

## 7. El caso `CloseOrder`

Recibe `OrderRepository`, la lista de `PaymentPort` (uno por medio), un generador de id y un reloj. No lee `process.env`, ni la hora del sistema, ni el menú.

```text
entrada: orderId, expectedTotal (centavos), payment (method + dato)
```

Orden de pasos y de validación (el orden es contrato; cada salto tiene prueba):

| # | Paso | Si falla | ¿Cobró? | ¿Guardó? |
|---|------|----------|---------|----------|
| 1 | `findById` | `OrderNotFoundError` | No | No |
| 2 | `order.canClose()` | `OrderNotClosableError` | No | No |
| 3 | `PaymentDetails` desde el comando | `InvalidPaymentMethodError`, `InvalidCardLast4Error`, `InvalidPayerReferenceError`, `InvalidMoneyError` | No | No |
| 4 | `expectedTotal` válido e igual a `order.totals().total` | `InvalidMoneyError`; `PaymentAmountMismatchError` | No | No |
| 5 | `ChargeRequest.of` (el efectivo alcanza) | `InsufficientCashError` | No | No |
| 6 | Elegir el `PaymentPort` por `method` | `PaymentMethodUnavailableError` | No | No |
| 7 | `port.charge(request)` lanza | `PaymentProcessorUnavailableError` (se propaga) | No (el procesador no respondió) | No |
| 8 | Resultado `declined` | `PaymentDeclinedError` con `reason` | No | No |
| 9 | `Payment.record(...)` y `order.close(payment)` | Error de dominio (no debería pasar tras 4 y 5) → anular cargo y relanzar | Anulado | No |
| 10 | `orders.save(closed)` | `OrderConcurrencyError` u otro → `port.voidCharge(reference)` y relanzar | Anulado | No |
| 10b | …y la anulación también falla | `PaymentVoidFailedError` (con el error de guardado como `cause`) | **Sí, sin cierre** (visible, no silencioso) | No |
| 11 | Releer la orden | Devuelve `{ order, payment }` de lo guardado | Sí | Sí |

Por qué este orden:

- **Nada externo antes de validar.** Los pasos 1–6 no tocan el adaptador. Una petición inválida nunca cobra.
- **El estado va antes que el dato** (como en el Sprint 3): una orden cancelada responde `OrderNotClosableError` aunque la tarjeta también sea inválida.
- **Total esperado.** El cajero manda el total que vio. Si otra pestaña cambió la propina, no se cobra un monto distinto al que se le dijo al cliente.
- **Doble clic / dos cajas.** La segunda petición que llegue tras el cierre cae en el paso 2. Si las dos leen `READY` a la vez, las dos cobran, una guarda y la otra recibe `OrderConcurrencyError` en el paso 10 y **anula** su cargo. Así no hay doble cobro que quede vivo.

Elección del medio (Strategy): el constructor indexa los `PaymentPort` por su `method`. Dos puertos con el mismo `method` es error de configuración y lanza al construir. El caso hace `ports.get(method)`; **no hay un `if` por medio** (anti-patrón de `arquitectura-hexagonal.md` §11). Agregar un medio nuevo es agregar un adaptador en el composition root.

`GetOrderPayment(orderId)`: `OrderNotFoundError` si no existe; `PaymentNotFoundError` si existe pero no tiene pago; si no, el `Payment`. No escribe.

Viven en `application/payment/` (módulo Pagos). Usan el mismo `OrderRepository`: el pago es parte del agregado `Order` (Gen 1: «`Order`: origen, líneas, estado, totales, pago»), así que no hace falta un `PaymentRepository`. El cierre y el pago se guardan en el mismo `save`, en una transacción (tarea 2).

## 8. Puerto `PaymentPort`

```ts
type PaymentDeclineReason = 'cardDeclined' | 'gatewayDeclined';

type ChargeResult =
  | { outcome: 'approved'; reference: string }
  | { outcome: 'declined'; reason: PaymentDeclineReason };

interface PaymentPort {
  readonly method: PaymentMethod;
  charge(request: ChargeRequest): Promise<ChargeResult>;
  voidCharge(reference: string): Promise<void>;
}
```

- Habla en dominio: `ChargeRequest`, `Money`, `PaymentMethod`. Sin HTTP, SQL ni SDK.
- Rechazo = resultado normal (`declined`). Procesador caído = el adaptador lanza `PaymentProcessorUnavailableError` (error de aplicación, definido junto al puerto).
- `reference`: texto de 1 a 64 caracteres que da el procesador. El efectivo también da una (folio de caja simulado), para que todo pago tenga referencia.
- El puerto se llama por su propósito (`PaymentPort`), no por tecnología. Los adaptadores sí: `CashPaymentAdapter`, `CardPaymentAdapter`, `DigitalGatewayFakeAdapter` (nombres de `arquitectura-hexagonal.md` §5).

## 9. Errores

Clase con `name` propio, mensaje fijo en inglés, sin HTTP ni SQL. La traducción a HTTP es de la tarea 2.

| Condición | Error | Capa |
|-----------|-------|------|
| `method` desconocido | `InvalidPaymentMethodError` | Dominio |
| `cardLast4` que no son 4 dígitos | `InvalidCardLast4Error` | Dominio |
| `payerReference` vacía, < 3 o > 64 tras recortar | `InvalidPayerReferenceError` | Dominio |
| Recibido o total esperado negativo, no entero, otra moneda | `InvalidMoneyError` (ya existe) | Dominio |
| Efectivo recibido menor que el total | `InsufficientCashError` | Dominio |
| Referencia del procesador vacía o > 64 | `InvalidPaymentReferenceError` | Dominio (error de programación del adaptador) |
| Total esperado distinto del total; o pago con monto distinto al total en `close` | `PaymentAmountMismatchError` | Dominio |
| Cerrar fuera de `READY` | `OrderNotClosableError` | Dominio (State) |
| `CLOSED` sin pago, pago sin `CLOSED`, o monto del pago ≠ total al restaurar | `InvalidOrderPaymentError` | Dominio |
| No hay adaptador para ese medio | `PaymentMethodUnavailableError` | Aplicación |
| Dos adaptadores con el mismo medio al construir `CloseOrder` | `PaymentPortConfigurationError` | Aplicación (error de arranque) |
| El procesador no respondió | `PaymentProcessorUnavailableError` | Aplicación (puerto) |
| El procesador rechazó | `PaymentDeclinedError` (`reason`) | Aplicación |
| Falló guardar y también anular | `PaymentVoidFailedError` | Aplicación |
| Orden con id ausente | `OrderNotFoundError` (ya existe) | Aplicación |
| Orden sin pago en `GetOrderPayment` | `PaymentNotFoundError` | Aplicación |
| Versión distinta al guardar | `OrderConcurrencyError` (ya existe) | Aplicación (puerto) |

## 10. Capas

- **Dominio:** `domain/payment/` (`payment-method.ts`, `payment-details.ts`, `charge-request.ts`, `payment.ts`, `payment.errors.ts`, `index.ts`); `Order` con `payment`, `close`, `canClose`; `canClose` y `close` en el State; `OrderNotClosableError` e `InvalidOrderPaymentError` en `order.errors.ts`. Sin Nest, Drizzle, Zod ni HTTP.
- **Aplicación:** puerto `application/ports/payment-port.ts`; `application/payment/` con `payment-command.ts`, `close-order.ts`, `get-order-payment.ts`, `payment.errors.ts` y el doble `fake-payment-port.ts`. El doble en memoria de órdenes copia `payment`.
- **Adaptadores:** ninguno, salvo pasar `payment: null` en el mapper de Drizzle para que compile (el plan lo explica). `AppModule` no cambia.

## 11. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Cobrar y no cerrar (falla el `save` tras aprobar) | Paso 10 anula el cargo; pruebas CO15–CO17 con doble espía; si la anulación falla, error visible `PaymentVoidFailedError` |
| Cobrar un monto distinto al que vio el cajero | `expectedTotal` obligatorio (CO8) |
| Un `if` por medio de pago en el caso | Strategy por mapa; revisión R4 con `rg` |
| El campo `payment` se pierde en `copy` o en el doble | `restore` exige `payment`; OC2 y RP11 con control |
| Romper RF3/RF4 o el contrato del Sprint 2–3 | Solo cambian las tres aserciones literales de `READY` y la tabla S8 (R7); S1–S8, OR1–OR16, OA1–OA10, CT/SD/SP siguen |
| Datos sensibles de tarjeta | Solo los últimos 4 dígitos; ni número, ni CVV, ni vencimiento |

## 12. Qué heredan las tareas 2 y 3

Sin cambiar estas reglas:

- **Tarea 2** implementa los tres adaptadores simulados de `PaymentPort` con disparadores de prueba fijos; guarda el pago en `order_payments` (1 a 1 con `orders`) dentro del mismo `save`; el mapper falla con `OrderMappingError` si una fila no cumple el dominio; HTTP expone `POST /orders/:orderId/close` y `GET /orders/:orderId/payment`. El JSON de `GET /orders/:id` solo cambia en que `READY` lista `close` en `allowedActions`.
- **Tarea 3** muestra el total que da la API, captura el medio y su dato, confirma, cobra y muestra el resultado con el cambio que manda el servidor. No resta, no calcula cambio, no decide si el efectivo alcanza.

## 13. Decisiones

Hector confirmó las decisiones 1, 3 y 9 el 4 de octubre de 2026. Las demás siguen como propuesta del análisis; se revisan antes del paso 1 del plan.

| # | Tema | Decisión | Estado |
|---|------|----------|--------|
| 1 | Desde qué estado se cobra | Solo `READY` (diagrama de Gen 1). No se cobra en `OPEN`/cocina ni cancelada | Confirmada |
| 2 | Forma del pago | Un pago aprobado por orden, por el total completo, un solo medio. Sin dividir ni parciales | Propuesta |
| 3 | Intentos rechazados | No se guardan. Se responden como error (`PaymentDeclinedError`); la orden sigue `READY` y se puede reintentar con otro medio | Confirmada |
| 4 | Guarda del monto | El cliente manda `expectedTotal`; si no coincide con el total del servidor, no se cobra | Propuesta |
| 5 | Datos por medio | Efectivo: monto recibido (cambio en el núcleo). Tarjeta: últimos 4 dígitos. Pasarela: referencia del pagador. Disparadores de simulador en la tarea 2 | Propuesta |
| 6 | Elección del medio | Strategy: lista de `PaymentPort` indexada por `method` en `CloseOrder`; sin `if` por medio | Propuesta |
| 7 | Dónde vive el pago | Dentro del agregado `Order`; se guarda con el mismo `OrderRepository.save`, en una transacción. Sin `PaymentRepository` | Propuesta |
| 8 | Falla al guardar tras aprobar | `voidCharge` en el puerto; el caso anula y relanza | Propuesta |
| 9 | Cómo sabe la UI si puede cobrar | `allowedActions` de `READY` gana `close` (cambian 3 aserciones + tabla S8) | Confirmada |
| 10 | Total en cero | Se cobra igual (cortesía) por cualquier medio | Propuesta |

Cambiar alguna obliga a corregir este análisis y los tres planes antes de tocar código.

## 14. Coincidencias y choques con la documentación

- Gen 1 pide `CloseOrder` + `PaymentPort` + Strategies, `Payment` con «medio, monto, resultado» y `CLOSED` «tras cobro exitoso». Se usan. «Resultado» queda implícito: solo se guarda el aprobado (decisión 3); el rechazo es la respuesta.
- La propuesta dice que `CerrarOrden` «calcula si hace falta, cobra vía Strategy, persiste, cierra». Coincide con la sección 7; «calcula» es `order.totals()`, que ya es determinista.
- El ejemplo de `arquitectura-hexagonal.md` §5 tiene `CloseOrder.execute(...): Promise<OrderTotals>`. Es ilustrativo; aquí devuelve `{ order, payment }`, que es lo que la pantalla de cobro necesita. La regla de fondo (puertos por constructor) es la misma.
- `analisis-patrones-diseno.md` menciona Factory «para seleccionar el procesador de pago». Con un mapa por `method` basta; no se crea Factory (Gen 1: «Factory solo si la creación lo pide»).
- El plan de la tarea 1 del Sprint 2 aún describe `startCooking`; ya está anotado en `pruebas-cttm.md`. Este sprint no lo toca.

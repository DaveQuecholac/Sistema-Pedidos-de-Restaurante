# Plan de acción — Tarea 1 · Cobro y cierre en el núcleo (E5)

**Rama:** `dev/pagos`  
**Sprint:** 4 (RF5). Tarea 1 de 3. Solo esta.  
**Fecha:** 4 de octubre de 2026  
**Estado:** cerrada el 4 de octubre de 2026 (núcleo RF5 con Vitest).  
**Análisis:** `analisis.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Resultado

Con Vitest y sin Postgres se cierra una orden `READY` cobrando con efectivo, tarjeta o pasarela a través de un doble de `PaymentPort`. El efectivo devuelve su cambio calculado en el núcleo. Una orden fuera de `READY`, un dato inválido, un total que no coincide o efectivo insuficiente se rechazan **sin llamar al cobro y sin guardar**. Un rechazo del procesador deja la orden `READY`. Si el guardado falla después de aprobar, el cargo se anula. Una orden cerrada ya no acepta ninguna operación. Los números de la sección 5.5 del análisis salen exactos.

## 2. No se toca

- `domain/menu/**`, `application/menu/**`.
- `domain/totals/**` y `application/totals/**`. El cobro usa `order.totals()` tal cual.
- `canEditLines`, `canAdjustTotals` y las transiciones existentes de `order-status.ts`. Solo se agrega `canClose`, la acción `close` y `READY.allowedActions`.
- `app.module.ts`, `main.ts`, `interface/**`, migraciones.
- `infrastructure/**`, salvo la excepción del paso 3.
- `apps/web/**`.

Si hace falta un archivo fuera de la sección 6, se lista en el chat y se acuerda antes de seguir.

## 3. Decisiones para implementar

Valen las decisiones de la sección 13 del análisis.

| Tema | Decisión |
|------|----------|
| Estado que cobra | Solo `READY`; `canClose` en el State |
| Pago | Uno aprobado por orden, por el total completo |
| Monto | `order.totals().total`; el comando trae `expectedTotal` y debe coincidir |
| Efectivo | `tendered ≥ total`; cambio derivado con `Money.subtract`, no guardado |
| Tarjeta | Solo `cardLast4` (4 dígitos) |
| Pasarela | `payerReference` de 3 a 64 caracteres tras recortar |
| Strategy | `CloseOrder` recibe `readonly PaymentPort[]` y los indexa por `method` |
| Fallo al guardar tras aprobar | `voidCharge(reference)` y relanzar; si también falla, `PaymentVoidFailedError` |
| `Order.restore` | `payment` obligatorio (`Payment \| null`); invariante `CLOSED ⇔ payment` y monto = total |
| Errores | Clases con `name` propio, mensaje fijo en inglés, sin HTTP ni SQL |

## 4. Contrato

### 4.1 Pago (`domain/payment/`)

```ts
type PaymentMethod = 'cash' | 'card' | 'digitalGateway';
function isPaymentMethod(value: unknown): value is PaymentMethod;

type PaymentDetails =
  | { readonly method: 'cash'; readonly tendered: Money }
  | { readonly method: 'card'; readonly cardLast4: string }
  | { readonly method: 'digitalGateway'; readonly payerReference: string };
const PaymentDetails: {
  cash(tendered: Money): PaymentDetails;
  card(cardLast4: unknown): PaymentDetails;               // InvalidCardLast4Error
  digitalGateway(payerReference: unknown): PaymentDetails; // InvalidPayerReferenceError (recorta)
};

class ChargeRequest {
  static of(input: { orderId: string; amount: Money; details: PaymentDetails }): ChargeRequest; // InsufficientCashError
  readonly orderId: string; readonly amount: Money; readonly details: PaymentDetails;
  get method(): PaymentMethod;
}

class Payment {
  static record(input: { id: string; request: ChargeRequest; reference: string; paidAt: Date }): Payment;
  static restore(input: { id: string; amount: Money; details: PaymentDetails; reference: string; paidAt: Date }): Payment;
  readonly id: string; readonly method: PaymentMethod; readonly amount: Money;
  readonly details: PaymentDetails; readonly reference: string; readonly paidAt: Date;
  get change(): Money | null;   // efectivo: tendered − amount; si no, null
}
```

`record` y `restore` validan lo mismo: referencia de 1 a 64 (`InvalidPaymentReferenceError`) y efectivo que cubre el monto (`InsufficientCashError`). `domain/payment` no importa `domain/order` ni `domain/totals`.

### 4.2 Estados (`domain/order/order-status.ts`)

```ts
type OrderAction = 'editLines' | 'sendToKitchen' | 'beginCooking' | 'markReady' | 'cancel' | 'close';
// OrderStatusBehavior gana: readonly canClose: boolean
// READY: canClose true; next('close') → 'CLOSED'; allowedActions() → ['close']
// Los demás: canClose false; next('close') lanza InvalidOrderTransitionError
```

### 4.3 Agregado (`domain/order/order.ts`)

```ts
class Order {
  static restore(input: OrderRestoreInput & { payment: Payment | null }): Order; // InvalidOrderPaymentError
  close(payment: Payment): Order;   // OrderNotClosableError | PaymentAmountMismatchError
  canClose(): boolean;
  get payment(): Payment | null;
}
```

`open` arranca con `payment` en `null`. `close` revisa primero el estado y luego que `payment.amount` sea igual a `this.totals().total`. Ninguna operación cambia `version`. Todas las operaciones existentes conservan `payment`.

### 4.4 Puerto (`application/ports/payment-port.ts`)

```ts
type PaymentDeclineReason = 'cardDeclined' | 'gatewayDeclined';
type ChargeResult =
  | { outcome: 'approved'; reference: string }
  | { outcome: 'declined'; reason: PaymentDeclineReason };

interface PaymentPort {
  readonly method: PaymentMethod;
  charge(request: ChargeRequest): Promise<ChargeResult>;  // PaymentProcessorUnavailableError
  voidCharge(reference: string): Promise<void>;
}
```

### 4.5 Comandos y casos (`application/payment/`)

```ts
type PaymentCommand =
  | { method: 'cash'; tendered: number }
  | { method: 'card'; cardLast4: string }
  | { method: 'digitalGateway'; payerReference: string };

type CloseOrderCommand = { orderId: string; expectedTotal: number; payment: PaymentCommand };
type ClosedOrder = { order: Order; payment: Payment };

class CloseOrder {
  constructor(
    orders: OrderRepository,
    payments: readonly PaymentPort[],   // PaymentPortConfigurationError si se repite un method
    newPaymentId: () => string,
    now: () => Date,
  );
  execute(command: CloseOrderCommand): Promise<ClosedOrder>;
}

class GetOrderPayment {
  constructor(orders: OrderRepository);
  execute(orderId: string): Promise<Payment>;  // OrderNotFoundError | PaymentNotFoundError
}
```

`toPaymentDetails(command)` vive en `payment-command.ts` (como `adjustment-command.ts` del Sprint 3) y comprueba `method` en ejecución. El orden de pasos de `CloseOrder` es la tabla de la sección 7 del análisis.

## 5. Reglas de trabajo

Valen para las tres tareas del sprint. Los planes de las tareas 2 y 3 remiten aquí.

1. **Un paso a la vez.** Cada paso cierra con estos dos comandos en verde; no se pasa al siguiente con un rojo:

   ```bash
   env -u DATABASE_URL pnpm --filter @restaurante/api test
   pnpm --filter @restaurante/api typecheck
   ```

2. **El número de pruebas no baja.** Piso de partida del sprint (4 de octubre, medido al escribir este plan): API **309** pasadas + **30** skipped; `test:db` **30** (cierre del Sprint 3); web **54**. Cada paso anota el número nuevo.
3. **Una prueba por fallo.** Cada fila del catálogo es un `it`. El id es el contrato.
4. **Un error no cobra ni escribe.** Cada caso con efectos tiene spec con dobles espía que afirman **cero `charge`** y **cero `save`** cuando la validación lanza antes del cobro, y **cero `save`** cuando el procesador rechaza o no responde.
5. **Un cargo aprobado nunca queda suelto.** Si después de aprobar algo falla, el spec afirma un `voidCharge` con la referencia exacta.
6. **Pruebas de control.** En los pasos marcados «Control» se rompe a propósito la regla (sin guardar el cambio), se confirma que la prueba falla y se restaura. Así se sabe que la prueba muerde.
7. **Paro.** Si una prueba del Sprint 1, 2 o 3 se pone roja (fuera de las tres aserciones de `READY` y la tabla S8 previstas), si doc y código chocan, o si aparece algo fuera de alcance: parar, anotar el síntoma y acordar con Hector. No se arregla de paso.
8. **Sin commits** salvo que Hector los pida.

## 6. Archivos

Dominio:

- `apps/api/src/domain/payment/payment-method.ts` · `payment-method.spec.ts`
- `apps/api/src/domain/payment/payment-details.ts` · `payment-details.spec.ts`
- `apps/api/src/domain/payment/charge-request.ts` · `charge-request.spec.ts`
- `apps/api/src/domain/payment/payment.ts` · `payment.spec.ts`
- `apps/api/src/domain/payment/payment.errors.ts`
- `apps/api/src/domain/payment/index.ts`
- `apps/api/src/domain/index.ts` (reexporta `payment`)
- `apps/api/src/domain/order/order-status.ts` · `order-status.spec.ts` (tabla S8 + aserción de `READY`)
- `apps/api/src/domain/order/order.ts` · `order.spec.ts` (aserciones de `READY` en las líneas 277 y 536; helper `withStatus('CLOSED')` → fixture cerrado)
- `apps/api/src/domain/order/order.errors.ts` (`OrderNotClosableError`, `InvalidOrderPaymentError`)
- `apps/api/src/domain/order/index.ts` (reexporta los errores nuevos)

Aplicación:

- `apps/api/src/application/ports/payment-port.ts`
- `apps/api/src/application/ports/index.ts` (reexporta `PaymentPort`)
- `apps/api/src/application/payment/payment.errors.ts`
- `apps/api/src/application/payment/payment-command.ts`
- `apps/api/src/application/payment/fake-payment-port.ts` · `fake-payment-port.spec.ts` (doble de prueba)
- `apps/api/src/application/payment/close-order.ts` · `close-order.spec.ts`
- `apps/api/src/application/payment/get-order-payment.ts` · `get-order-payment.spec.ts`
- `apps/api/src/application/order/in-memory-order-repository.ts` · su spec
- `apps/api/src/application/order/order-test-fixtures.ts` (`readyOrderL()`, `closedOrderL()`)

Excepción obligada (paso 3): `apps/api/src/infrastructure/persistence/drizzle/order.mapper.ts` pasa `payment: null` a `Order.restore`. Es lo que hoy hay en la base (no hay órdenes `CLOSED`). La tarea 2 lo completa.

Un archivo, una preocupación. Sin `utils/`.

## 7. Pasos

### Paso 0 — Línea base

1. `git status` en `dev/pagos`: sin cambios de producto (solo estos docs).
2. API test → **309** + 30 skipped. `typecheck` verde.
3. Web test → **54**.
4. `rg "'CLOSED'" apps/api/src/application apps/api/src/interface`: anotar quién usa `CLOSED` hoy (esperado: nadie fuera de dominio y schema).
5. Si no coinciden, parar: la rama no está donde dice el cierre del Sprint 3.

### Paso 1 — Pago en el dominio

`PaymentMethod`, `PaymentDetails`, `ChargeRequest`, `Payment` y sus errores. Pruebas PM1–PM2, PD1–PD6, CR1–CR5, PY1–PY7.

**Prueba de error:** los valores inválidos se prueban con lo que mandaría HTTP sin tipo (`4242` como número, `"abcd"`, `"  "`, `1.5`, `NaN`), no con `as any` sobre un tipo que lo prohíbe.

**Control:** quitar la comparación `tendered < amount` de `ChargeRequest.of` → CR3 falla. Calcular el cambio como `amount − tendered` → PY1 falla. Restaurar.

### Paso 2 — Estados

`canClose`, acción `close`, `READY → CLOSED`, `READY.allowedActions() → ['close']`. Actualizar la tabla `NEXT_TABLE` de S8 (columna `close`) y la aserción de `READY` en `order-status.spec.ts:144`. Pruebas ST4–ST7. S1–S8 y ST1–ST3 siguen.

**Control:** dejar que `IN_KITCHEN` acepte `close` → ST5 y S8 fallan. Restaurar.

### Paso 3 — Agregado

`Order` con `payment`, `close`, `canClose`. `restore` con `payment` obligatorio y la invariante de la sección 5.4 del análisis. Ajustar lo que marque el typecheck: doble en memoria (solo pasar `payment`), specs que usan `restore`, el mapper (solo `null`). En `order.spec.ts`: las dos aserciones de `READY` (`[]` → `['close']`) y los usos de `withStatus('CLOSED', …)` pasan a `closedOrderL()`. Pruebas OC1–OC11.

**Control:** quitar `payment` del `copy` de `close` → OC2 falla. Quitar la comparación de monto en `close` → OC4 falla. Restaurar.

### Paso 4 — Doble en memoria

`InMemoryOrderRepository.copy` lleva `payment`. Pruebas RP11–RP12. RP1–RP10 siguen.

**Control:** quitar `payment` de `copy` → RP11 falla. Restaurar.

### Paso 5 — Puerto, errores de aplicación y doble de cobro

`payment-port.ts`, `application/payment/payment.errors.ts`, `payment-command.ts`, `fake-payment-port.ts`. El doble registra cada `charge` y `voidCharge`, y se configura por prueba: aprobar con una referencia fija, rechazar con un `reason`, lanzar `PaymentProcessorUnavailableError`, o fallar al anular. Pruebas FP1–FP3.

### Paso 6 — `CloseOrder`

En el orden de la tabla de la sección 7 del análisis. Pruebas CO1–CO21.

**Control (tres, uno por uno):**

- Mover `charge` antes de `canClose` → CO5 falla (el doble registra un `charge`).
- Quitar `voidCharge` del `catch` del `save` → CO15 falla.
- Quitar la comparación de `expectedTotal` → CO8 falla.

Restaurar cada uno antes del siguiente.

### Paso 7 — `GetOrderPayment`

Pruebas GP1–GP4.

### Paso 8 — Exportaciones

`domain/payment/index.ts`, `domain/index.ts`, `domain/order/index.ts`, `application/ports/index.ts`. Solo reexportar. API test y typecheck.

### Paso 9 — Red de seguridad

R1–R8. Anotar en la sección 11.

## 8. Catálogo de pruebas

Fixtures: carta de la tarea 1 del Sprint 3 (**Tacos** `4500`, tasa `1600`, Queso `1500`; **Agua** `2500`, tasa `0`). Orden **L**: Tacos × 2 con Queso + Agua × 1, llevada a `READY` (`readyOrderL()`); total **16420**. **L+** = L con descuento 10 % y propina 10 %; total **16083**. Reloj fijo `2026-10-04T18:00:00Z`; id de pago `pay-1`.

### Pago

| Id | Dado | Entonces |
|----|------|----------|
| PM1 | `isPaymentMethod` con `cash`, `card`, `digitalGateway` | verdadero |
| PM2 | `coupon`, `''`, `null`, `1` | falso |
| PD1 | `PaymentDetails.cash(Money 20000)` | `method` `cash`, `tendered` 20000 |
| PD2 | `card('4242')`, `card('0000')` | válidos; guardan el texto tal cual |
| PD3 | `card('424')`, `card('42424')`, `card('abcd')`, `card('42 4')`, `card(4242)` | `InvalidCardLast4Error` |
| PD4 | `digitalGateway('  cliente@correo.mx  ')` | `payerReference` `cliente@correo.mx` |
| PD5 | `digitalGateway('')`, `('  ')`, `('ab')`, 65 caracteres, `(42)` | `InvalidPayerReferenceError` |
| PD6 | El llamador intenta cambiar el objeto devuelto | `readonly`; otra lectura da lo mismo |
| CR1 | Efectivo 20000, total 16420 | válido |
| CR2 | Efectivo 16420, total 16420 | válido |
| CR3 | Efectivo 16000, total 16420 | `InsufficientCashError` |
| CR4 | Tarjeta y pasarela con total 16420 y con total 0 | válidos |
| CR5 | Efectivo 0, total 0 | válido |
| PY1 | `record` de CR1 con `reference` `cash-1` | `change` **3580**; `amount` 16420; `method` `cash` |
| PY2 | `record` de CR2 | `change` **0** |
| PY3 | `record` de tarjeta `4242` | `change` `null`; `details.cardLast4` `4242` |
| PY4 | `reference` `''`, `'  '`, 65 caracteres | `InvalidPaymentReferenceError` |
| PY5 | `restore` con los mismos datos que PY1 | igual campo por campo; `change` 3580 |
| PY6 | `restore` de efectivo con `tendered` < `amount` | `InsufficientCashError` |
| PY7 | Efectivo 20000 sobre L+ (16083) | `change` **3917** |

### Estados

| Id | Dado | Entonces |
|----|------|----------|
| ST4 | `canClose` en los 6 estados | verdadero solo en `READY` |
| ST5 | `next('close')` en los 6 estados | `READY` → `CLOSED`; los otros cinco `InvalidOrderTransitionError` |
| ST6 | `allowedActions` en los 6 estados | `READY` `['close']`; los demás iguales al Sprint 2 (literal) |
| ST7 | `ORDER_TRANSITION_ACTIONS` | incluye `close`; S8 recorre la tabla completa con la columna nueva |

### Agregado

| Id | Dado | Entonces |
|----|------|----------|
| OC1 | `Order.open` | `payment` `null`; `canClose()` falso |
| OC2 | `readyOrderL().close(pago de 16420)` | otra orden `CLOSED` con ese pago; la original `READY` sin pago; misma `version`, líneas, descuento y propina |
| OC3 | `close` en `OPEN`, `SENT_TO_KITCHEN`, `IN_KITCHEN`, `CANCELLED` y `CLOSED` | `OrderNotClosableError` |
| OC4 | `close` en `READY` con pago de 16000 | `PaymentAmountMismatchError` |
| OC5 | Sobre una cerrada: `addLine`, `replaceLine`, `cancelLine` | `OrderNotEditableError` |
| OC6 | Sobre una cerrada: `setDiscount`, `setTip` | `OrderTotalsNotAdjustableError` |
| OC7 | Sobre una cerrada: `sendToKitchen`, `beginCooking`, `markReady`, `cancel` | `InvalidOrderTransitionError` |
| OC8 | `restore` `CLOSED` sin pago; `restore` `READY` con pago | `InvalidOrderPaymentError` en los dos |
| OC9 | `restore` `CLOSED` con pago de monto ≠ total | `InvalidOrderPaymentError` |
| OC10 | L+ en `READY`: `close` con 16083 | funciona; con 16420 `PaymentAmountMismatchError` |
| OC11 | `allowedActions()` en cada estado | igual que en el Sprint 2 salvo `READY` (`['close']`) |

### Doble en memoria

| Id | Dado | Entonces |
|----|------|----------|
| RP11 | `save` de una orden cerrada; `findById` | trae el pago igual (id, medio, monto, detalles, referencia, hora); `version` + 1 |
| RP12 | `list` con `CLOSED` | cada orden trae su pago |

### Doble de cobro

| Id | Dado | Entonces |
|----|------|----------|
| FP1 | Configurado para aprobar con `ref-1` | `charge` devuelve `approved` con `ref-1` y registra la petición |
| FP2 | Configurado para rechazar con `cardDeclined` | devuelve `declined`; registra la petición |
| FP3 | Configurado para fallar | `charge` lanza `PaymentProcessorUnavailableError`; `voidCharge` configurado para fallar lanza |

### Casos de uso

| Id | Caso | Dado | Entonces |
|----|------|------|----------|
| CO1 | `CloseOrder` | L, efectivo 20000, `expectedTotal` 16420 | devuelve orden `CLOSED` y pago con `change` 3580; un `charge` con monto 16420; un `save` |
| CO2 | `CloseOrder` | L, tarjeta `4242` | `CLOSED`; `cardLast4` `4242`; `change` `null` |
| CO3 | `CloseOrder` | L, pasarela `cliente@correo.mx` | `CLOSED`; `payerReference` guardada |
| CO4 | `CloseOrder` | id ausente | `OrderNotFoundError`; cero `charge`, cero `save` |
| CO5 | `CloseOrder` | orden en `OPEN`, `SENT_TO_KITCHEN`, `IN_KITCHEN`, `CANCELLED`, `CLOSED` | `OrderNotClosableError`; cero `charge`, cero `save` |
| CO6 | `CloseOrder` | orden `CANCELLED` con tarjeta `12` | `OrderNotClosableError` (el estado va antes) |
| CO7 | `CloseOrder` | `method` `coupon` (sin tipo); tarjeta `12`; pasarela `''`; efectivo `-1`; efectivo `1.5` | `InvalidPaymentMethodError`; `InvalidCardLast4Error`; `InvalidPayerReferenceError`; `InvalidMoneyError` × 2; cero `charge`, cero `save` |
| CO8 | `CloseOrder` | L con propina 10 % guardada (total 17870) y `expectedTotal` 16420 | `PaymentAmountMismatchError`; cero `charge`, cero `save` |
| CO9 | `CloseOrder` | `expectedTotal` `-1`, `1.5`, `"16420"` | `InvalidMoneyError`; cero `charge` |
| CO10 | `CloseOrder` | efectivo 16000 | `InsufficientCashError`; cero `charge`, cero `save` |
| CO11 | `CloseOrder` | puertos solo de efectivo; pago con tarjeta | `PaymentMethodUnavailableError`; cero `charge` |
| CO12 | `CloseOrder` | constructor con dos puertos `cash` | `PaymentPortConfigurationError` al construir |
| CO13 | `CloseOrder` | el puerto rechaza (`cardDeclined`) | `PaymentDeclinedError` con `reason` `cardDeclined`; cero `save`; releer: `READY`, sin pago, misma `version` |
| CO14 | `CloseOrder` | el puerto lanza `PaymentProcessorUnavailableError` | se propaga; cero `save`; cero `voidCharge` |
| CO15 | `CloseOrder` | otro `save` entre la lectura y el `save` del caso | `OrderConcurrencyError`; un `voidCharge` con la referencia aprobada; la orden queda como la dejó el otro |
| CO16 | `CloseOrder` | `save` lanza `Error('boom')` | un `voidCharge`; se relanza el mismo error |
| CO17 | `CloseOrder` | `save` lanza y `voidCharge` también | `PaymentVoidFailedError` con `cause` = error del `save` |
| CO18 | `CloseOrder` | L+ con `expectedTotal` 16083 y efectivo 20000 | `CLOSED`; `change` 3917 |
| CO19 | `CloseOrder` | CO1 y otra vez lo mismo | la segunda: `OrderNotClosableError`; el doble tiene **un** `charge` en total |
| CO20 | `CloseOrder` | L con descuento fijo 20000 (total 0): efectivo 0; en otra orden, tarjeta `4242` | los dos cierran con monto 0 |
| CO21 | `CloseOrder` | CO1 | pago con id `pay-1`, `paidAt` del reloj fijo, `reference` del doble; la orden devuelta es la releída (`version` 1) |
| GP1 | `GetOrderPayment` | orden cerrada por CO1 | el pago de CO1 |
| GP2 | `GetOrderPayment` | orden `READY` sin pago | `PaymentNotFoundError` |
| GP3 | `GetOrderPayment` | id ausente | `OrderNotFoundError` |
| GP4 | `GetOrderPayment` | cualquiera | cero `save` |

S1–S8, ST1–ST3, OR1–OR16, OA1–OA10, RP1–RP10, CT1–CT4, SD1–SD11 y SP1–SP10 siguen, con los únicos ajustes previstos de la sección 3 del análisis (hecho 3 y 4).

### Red de seguridad

| Id | Entonces |
|----|----------|
| R1 | `domain/payment`, `application/payment` y `application/ports/payment-port.ts` no importan `@nestjs/*`, `drizzle-orm`, `postgres`, `zod` ni `infrastructure/` |
| R2 | `domain/payment` no importa `domain/order` ni `domain/totals` |
| R3 | Sin `Math.round`, `toFixed`, `parseFloat` ni `/ 100` en `domain/payment` |
| R4 | `close-order.ts` no tiene `if`/`switch` sobre `method` (`'cash'`, `'card'`, `'digitalGateway'`) |
| R5 | Sin `new Date(`, `Date.now` ni `process.env` en `domain/payment` y `application/payment` (salvo specs) |
| R6 | API test pasa; número mayor que 309; 30 skipped iguales |
| R7 | `git diff --name-only` no toca `interface/`, `app.module.ts`, `apps/web`, `domain/totals`, `application/totals`; en `infrastructure/` solo el `null` del mapper |
| R8 | El diff de `order-status.ts` solo agrega `canClose`, la acción `close`, la transición de `READY` y su `allowedActions` |

```bash
rg "@nestjs|drizzle-orm|from 'postgres'|from 'zod'|infrastructure/" apps/api/src/domain/payment apps/api/src/application/payment apps/api/src/application/ports/payment-port.ts
rg "domain/order|domain/totals|\.\./order|\.\./totals" apps/api/src/domain/payment
rg "Math\.round|toFixed|parseFloat|/ 100\b" apps/api/src/domain/payment
rg "'cash'|'card'|'digitalGateway'" apps/api/src/application/payment/close-order.ts
rg "new Date\(|Date\.now|process\.env" apps/api/src/domain/payment apps/api/src/application/payment --glob '!*.spec.ts'
```

Resultado esperado de los cinco: vacío.

## 9. Qué no demuestra esta tarea

- Que el pago sobreviva un reinicio. Es la tarea 2.
- Que los tres simuladores aprueben, rechacen y fallen con sus disparadores. Es la tarea 2.
- Que HTTP responda 402 al rechazo o 409 al total distinto. Es la tarea 2.
- Que la pantalla cobre. Es la tarea 3.

## 10. Hecho cuando

- [x] PM1–PM2, PD1–PD6, CR1–CR5, PY1–PY7 pasan
- [x] ST4–ST7, OC1–OC11, RP11–RP12, FP1–FP3 pasan; S1–S8, OR1–OR16, OA1–OA10 y RP1–RP10 siguen
- [x] CO1–CO21 y GP1–GP4 pasan; CT, SD y SP del Sprint 3 siguen
- [x] Los controles de los pasos 1, 2, 3, 4 y 6 fallaron al romper y pasaron al restaurar
- [x] R1–R8 se cumplen
- [x] Ningún caso cobra cuando la validación lanza, y ningún cargo aprobado queda sin cierre ni anulación

## 11. Cierre

**Fecha:** 4 de octubre de 2026.  
**API test:** 374 passed + 30 skipped (piso de partida 309 + 30).  
**Typecheck:** verde.

| Id | Resultado |
|----|-----------|
| R1 | Vacío (sin Nest/Drizzle/postgres/zod/infrastructure en payment) |
| R2 | Vacío (`domain/payment` no importa order ni totals) |
| R3 | Vacío (sin `Math.round` / `toFixed` / `parseFloat` / `/ 100`) |
| R4 | Vacío (`close-order.ts` sin literales de medio) |
| R5 | Vacío (sin `new Date` / `Date.now` / `process.env` fuera de specs) |
| R6 | 374 > 309; 30 skipped iguales |
| R7 | Cumple el espíritu del slice. Excepciones mínimas obligadas: (1) `order.controller.spec` H21 `READY` `[]` → `['close']` (misma aserción del State); (2) `payment: null` en specs que llaman `Order.restore` (`application/totals/*`, `totals.controller.spec`); (3) mapper Drizzle solo `payment: null`. Sin cambios en `app.module.ts`, `apps/web` ni `domain/totals` de producción |
| R8 | Diff de `order-status.ts` solo `canClose`, acción `close`, `READY → CLOSED` y `allowedActions` |

Siguiente: tarea 2 (`02-adaptadores-persistencia-y-api/`).

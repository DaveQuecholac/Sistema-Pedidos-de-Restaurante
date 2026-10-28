# Plan de acción — Tarea 1 · Cálculo de totales en el núcleo (E4)

**Rama:** `dev/totales`  
**Sprint:** 3 (RF4). Tarea 1 de 3. Solo esta.  
**Fecha:** 4 de octubre de 2026  
**Estado:** acordado el 4 de octubre de 2026.  
**Análisis:** `analisis.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Resultado

Con Vitest y sin Postgres se calcula el desglose de una orden: importe de cada línea, subtotal, descuento, impuesto por tasa, propina y total. Se guarda un descuento o una propina en una orden viva y se rechaza en una cancelada. Los números de la sección 5.8 del análisis salen exactos, iguales en cada corrida y sin importar el orden de las líneas. Ninguna regla RF3 cambia.

## 2. No se toca

- `domain/menu/**`, `application/menu/**`.
- `canEditLines`, transiciones y `allowedActions()` de `order-status.ts`. Solo se agrega `canAdjustTotals`.
- `app.module.ts`, `main.ts`, `interface/**`, migraciones.
- `infrastructure/**`, salvo la excepción del paso 5.
- `apps/web/**`.
- Cobro y cierre.

Si hace falta un archivo fuera de la sección 6, se lista en el chat y se acuerda antes de seguir.

## 3. Decisiones para implementar

Valen las decisiones de la sección 13 del análisis.

| Tema | Decisión |
|------|----------|
| Aritmética | Centavos enteros; productos con `BigInt`; redondeo mitad hacia arriba |
| Impuesto | Precio sin impuesto; por grupo de tasa, una vez por grupo; grupos por tasa ascendente, incluido 0 % |
| Descuento | Uno o ninguno; `percentage` o `fixedAmount`; antes de impuestos; fijo topado; reparto por residuo mayor, empate a la tasa menor |
| Propina | Una o ninguna; `percentage` sobre subtotal − descuento, o `fixedAmount`; sin impuesto |
| Porcentaje | `Percentage`: entero de 1 a 10000 puntos base |
| Ajustable | `OPEN`, `SENT_TO_KITCHEN`, `IN_KITCHEN`, `READY` |
| `Order.restore` | `discount` y `tip` obligatorios (`… \| null`), para que el typecheck marque cada llamador |
| Totales | Derivados; no se guardan |
| Errores | Clases con `name` propio, mensaje fijo en inglés, sin HTTP ni SQL |

## 4. Contrato

### 4.1 Dinero (`domain/money/money.ts`)

```ts
class Money {
  static of(amount: number, currency: string): Money;   // ya existe
  static zero(currency: string): Money;
  add(other: Money): Money;                              // MoneyOverflowError
  subtract(other: Money): Money;                         // NegativeMoneyError
  times(multiplier: number): Money;                      // InvalidMultiplierError | MoneyOverflowError
  percentage(basisPoints: number): Money;                // mitad hacia arriba, BigInt
  allocate(weights: readonly number[]): Money[];         // residuo mayor; empate al índice menor
  equals(other: Money): boolean;
  isGreaterThan(other: Money): boolean;
}
```

`allocate` con `amount > 0` y todos los pesos en 0 lanza `InvalidAllocationError`. Con `amount = 0` devuelve ceros. Quien llama ordena los pesos por tasa ascendente; así «empate al índice menor» es «empate a la tasa menor».

### 4.2 Cálculo (`domain/totals/`)

```ts
class Percentage { static of(basisPoints: number): Percentage; get basisPoints(): number }

type AdjustmentKind = 'percentage' | 'fixedAmount';

interface Discount {                       // Strategy
  readonly kind: AdjustmentKind;
  amountFor(subtotal: Money): Money;       // nunca mayor que subtotal
}
const Discount: {
  percentage(rate: Percentage): Discount;
  fixedAmount(amount: Money): Discount;    // InvalidDiscountError si es 0
};

interface Tip {                            // Strategy
  readonly kind: AdjustmentKind;
  amountFor(base: Money): Money;
}
const Tip: {
  percentage(rate: Percentage): Tip;
  fixedAmount(amount: Money): Tip;         // InvalidTipError si es 0
};

type TotalsLine = {
  lineId: string; name: string; quantity: number;
  unitPrice: Money; extras: readonly Money[]; taxRate: TaxRate;
};

type OrderTotals = {
  lines: { lineId; name; quantity; unitAmount: Money; lineSubtotal: Money; taxRate: TaxRate }[];
  subtotal: Money;
  discount: { discount: Discount; requested: Money | null; amount: Money } | null;
  taxes: { taxRate: TaxRate; taxableBase: Money; amount: Money }[];   // tasa ascendente
  taxTotal: Money;
  tip: { tip: Tip; amount: Money } | null;
  total: Money;
};

function calculateTotals(input: {
  lines: readonly TotalsLine[];
  discount: Discount | null;
  tip: Tip | null;
}): OrderTotals;
```

`domain/totals` no importa `domain/order`.

### 4.3 Agregado (`domain/order/order.ts`)

```ts
class Order {
  static restore(input: OrderRestoreInput & { discount: Discount | null; tip: Tip | null }): Order;
  setDiscount(discount: Discount | null): Order;   // OrderTotalsNotAdjustableError
  setTip(tip: Tip | null): Order;                  // OrderTotalsNotAdjustableError
  totals(): OrderTotals;                           // arma TotalsLine y delega en calculateTotals
  canAdjustTotals(): boolean;
  get discount(): Discount | null;
  get tip(): Tip | null;
}
```

`open` arranca con `discount` y `tip` en `null`. Ninguna operación cambia `version`. Todas las operaciones existentes conservan `discount` y `tip`.

### 4.4 Comandos

```ts
type AdjustmentCommand =
  | { kind: 'percentage'; basisPoints: number }
  | { kind: 'fixedAmount'; amount: number };
type SetOrderDiscountCommand = { orderId: string; discount: AdjustmentCommand | null };
type SetOrderTipCommand = { orderId: string; tip: AdjustmentCommand | null };
// CalculateTotals.execute(orderId: string): Promise<OrderTotals>
```

Los casos comprueban `kind` en ejecución (`InvalidDiscountError` / `InvalidTipError`): HTTP lo filtrará en la tarea 2, pero el núcleo no confía en el tipo.

## 5. Reglas de trabajo

Valen para las tres tareas del sprint. Los planes de las tareas 2 y 3 remiten aquí.

1. **Un paso a la vez.** Cada paso cierra con estos dos comandos en verde; no se pasa al siguiente con un rojo:

   ```bash
   env -u DATABASE_URL pnpm --filter @restaurante/api test
   pnpm --filter @restaurante/api typecheck
   ```

2. **El número de pruebas no baja.** Piso de partida del sprint (4 de octubre): API **210** pasadas + **22** skipped; `test:db` **22**; web **36**. Cada paso anota el número nuevo.
3. **Una prueba por fallo.** Cada fila del catálogo es un `it`. El id es el contrato.
4. **Un error no escribe.** Cada caso que escribe tiene spec con doble espía que afirma cero `save` cuando el agregado o la validación lanzan.
5. **Pruebas de control.** En los pasos marcados «Control» se rompe a propósito la regla (sin guardar el cambio), se confirma que la prueba falla y se restaura. Así se sabe que la prueba muerde.
6. **Paro.** Si una prueba del Sprint 1 o 2 se pone roja, si doc y código chocan, o si aparece algo fuera de alcance: parar, anotar el síntoma y acordar con Hector. No se arregla de paso.
7. **Sin commits** salvo que Hector los pida.

## 6. Archivos

Dominio:

- `apps/api/src/domain/money/money.ts` · `money.spec.ts` (se amplían)
- `apps/api/src/domain/money/index.ts` (reexporta errores nuevos)
- `apps/api/src/domain/totals/percentage.ts` · `percentage.spec.ts`
- `apps/api/src/domain/totals/discount.ts` · `discount.spec.ts`
- `apps/api/src/domain/totals/tip.ts` · `tip.spec.ts`
- `apps/api/src/domain/totals/order-totals.ts` · `order-totals.spec.ts`
- `apps/api/src/domain/totals/totals.errors.ts`
- `apps/api/src/domain/totals/index.ts`
- `apps/api/src/domain/index.ts` (reexporta `totals`)
- `apps/api/src/domain/order/order-status.ts` · `order-status.spec.ts`
- `apps/api/src/domain/order/order.ts` · `order.spec.ts`
- `apps/api/src/domain/order/order.errors.ts` (`OrderTotalsNotAdjustableError`)

Aplicación:

- `apps/api/src/application/order/in-memory-order-repository.ts` · su spec
- `apps/api/src/application/order/order-test-fixtures.ts` (agrega Agua `2500`, tasa 0, extra Chía `500`, omitir Azúcar)
- `apps/api/src/application/totals/adjustment-command.ts` (`AdjustmentCommand` → `Discount` / `Tip`)
- `apps/api/src/application/totals/calculate-totals.ts` · spec
- `apps/api/src/application/totals/set-order-discount.ts` · spec
- `apps/api/src/application/totals/set-order-tip.ts` · spec

Excepción obligada (paso 5): `apps/api/src/infrastructure/persistence/drizzle/order.mapper.ts` pasa `discount: null, tip: null` a `Order.restore`. Es lo que hoy hay en la base. La tarea 2 lo completa.

Un archivo, una preocupación. Sin `utils/`.

## 7. Pasos

### Paso 0 — Línea base

1. `git status` limpio en `dev/totales`.
2. API test → **210** + 22 skipped. `typecheck` verde.
3. Web test → **36**.
4. Si no coinciden, parar: la rama no está donde dice la última corrida CTTM.

**Línea base — 4 de octubre de 2026**

| Comando | Resultado |
|---------|-----------|
| Rama | `dev/totales` (al día con `origin`) |
| Working tree | Sin cambios de producto. Pendientes solo docs: `docs/dev/totales/**` (sin track) y `docs/README.md` (modificado) |
| `env -u DATABASE_URL pnpm --filter @restaurante/api test` | **210** passed + **22** skipped |
| `pnpm --filter @restaurante/api typecheck` | OK |
| `pnpm --filter @restaurante/web test` | **36** passed |
| `pnpm --filter @restaurante/web typecheck` | OK |

Piso del sprint: API **210** + 22 skipped; web **36**. No pueden bajar.

### Paso 1 — Dinero

Operaciones de `Money` y sus errores. Pruebas MN1–MN10.

**Control:** redondear `percentage` hacia abajo → MN5 falla. Mandar el sobrante de `allocate` siempre al último → MN7 falla. Restaurar.

**Hecho — 4 de octubre de 2026**

| Chequeo | Resultado |
|---------|-----------|
| MN1–MN10 | pasan |
| Control MN5 (percentage hacia abajo) | falla como se espera; restaurado |
| Control MN7 (sobrante siempre al último) | falla como se espera; restaurado. (El plan decía «al primero»; con los pesos de MN7 no mordía. Acordado: «al último».) |
| API test | **219** passed + **22** skipped |
| Typecheck API | OK |

### Paso 2 — Porcentaje, descuento y propina

`Percentage`, Strategies `Discount` y `Tip`, errores. Pruebas PC1–PC3, DS1–DS7, TP1–TP6.

**Prueba de error:** los valores inválidos se prueban con lo que mandaría HTTP sin tipo (`"10"`, `1.5`, `NaN`), no con `as any` sobre un tipo que lo prohíbe.

**Hecho — 4 de octubre de 2026**

| Chequeo | Resultado |
|---------|-----------|
| PC1–PC3, DS1–DS7, TP1–TP6 | pasan |
| API test | **235** passed + **22** skipped |
| Typecheck API | OK |

### Paso 3 — Cálculo de totales

`calculateTotals` y `OrderTotals`. Pruebas TT1–TT14.

**Control:** redondear por línea en lugar de por grupo → TT10 falla. Aplicar el descuento después de impuestos → TT4 falla. Restaurar.

No se avanza si TT11 (invariantes) no pasa en todos sus casos.

**Hecho — 4 de octubre de 2026**

| Chequeo | Resultado |
|---------|-----------|
| TT1–TT14 | pasan (TT4 base 0 % corregida a 2250; ver catálogo) |
| Control TT10 (impuesto por línea) | falla como se espera; restaurado |
| Control TT4 (descuento después de impuestos) | falla como se espera; restaurado |
| TT11 invariantes | pasan en los 8 casos |
| API test | **249** passed + **22** skipped |
| Typecheck API | OK |

### Paso 4 — Estados

`canAdjustTotals` en cada objeto State. Pruebas ST1–ST3. S1–S8 del Sprint 2 siguen sin cambio.

**Hecho — 4 de octubre de 2026**

| Chequeo | Resultado |
|---------|-----------|
| ST1–ST3 | pasan |
| S1–S8 | siguen |
| API test | **252** passed + **22** skipped |
| Typecheck API | OK |

### Paso 5 — Agregado

`Order` con `discount`, `tip`, `setDiscount`, `setTip`, `totals()`, `canAdjustTotals()`. `restore` con los dos campos obligatorios. Ajustar lo que marque el typecheck: doble en memoria, specs que usan `restore` y el mapper (solo `null`). Pruebas OA1–OA10.

**Control:** quitar `discount` de `Order.copy` → OA9 falla. Restaurar.

**Hecho — 4 de octubre de 2026**

| Chequeo | Resultado |
|---------|-----------|
| OA1–OA10 | pasan |
| Control OA9 (sin `discount` en `copy`) | falla como se espera; restaurado |
| OR1–OR16 | siguen |
| API test | **262** passed + **22** skipped |
| Typecheck API | OK |

### Paso 6 — Doble en memoria

`InMemoryOrderRepository.copy` lleva `discount` y `tip`. Pruebas RP9–RP10. RP1–RP8 siguen.

**Control:** quitar `tip` de `copy` → RP9 falla. Restaurar.

**Hecho — 4 de octubre de 2026**

| Chequeo | Resultado |
|---------|-----------|
| RP9–RP10 | pasan |
| Control RP9 (sin `tip` en `copy`) | falla como se espera; restaurado |
| RP1–RP8 | siguen |
| API test | **264** passed + **22** skipped |
| Typecheck API | OK |

### Paso 7 — Casos de uso

En este orden, cada uno con su spec: `CalculateTotals`, `SetOrderDiscount`, `SetOrderTip`. Pruebas CT1–CT4, SD1–SD11, SP1–SP10.

**Hecho — 4 de octubre de 2026**

| Chequeo | Resultado |
|---------|-----------|
| CT1–CT4, SD1–SD11, SP1–SP10 | pasan |
| API test | **289** passed + **22** skipped |
| Typecheck API | OK |

### Paso 8 — Red de seguridad

R1–R7. Anotar en la sección 11.

**Hecho — 4 de octubre de 2026.** Ver sección 11.

## 8. Catálogo de pruebas

Fixtures: **Tacos** `4500`, tasa `1600`, extra Queso `1500`, omitir Cilantro. **Agua** `2500`, tasa `0`, extra Chía `500`, omitir Azúcar. Orden base **L**: Tacos × 2 con Queso + Agua × 1.

### Dinero

| Id | Dado | Entonces |
|----|------|----------|
| MN1 | `4500 + 1500` | `6000`; los dos originales sin cambio |
| MN2 | `6000.times(2)`, `.times(0)` | `12000`, `0` |
| MN3 | `.times(1.5)`, `.times(-1)`, `.times(NaN)` | `InvalidMultiplierError` |
| MN4 | `14500 − 1450`; `100 − 101` | `13050`; `NegativeMoneyError` |
| MN5 | `percentage`: 25×1000, 3×1600, 1×5000, 14500×333, 13050×1500 | `3`, `0`, `1`, `483`, `1958` |
| MN6 | `2_147_483_647.percentage(10000)` | `2_147_483_647` exacto |
| MN7 | `5000.allocate([12000, 2500])`; `1450.allocate([12000, 2500])` | `[4138, 862]`; `[1200, 250]` |
| MN8 | `1.allocate([1000, 1000])`; `0.allocate([0, 0])`; `1.allocate([0, 0])` | `[1, 0]`; `[0, 0]`; `InvalidAllocationError` |
| MN9 | `2_147_483_647 + 1`; `2_000_000_000.times(2)` | `MoneyOverflowError` en los dos |
| MN10 | Pruebas de `Money.of` del Sprint 1 | Siguen igual |

### Porcentaje, descuento, propina

| Id | Dado | Entonces |
|----|------|----------|
| PC1 | `Percentage.of(1)`, `of(10000)` | válidos |
| PC2 | `of(0)`, `of(10001)`, `of(-1)` | `InvalidPercentageError` |
| PC3 | `of(10.5)`, `of(NaN)`, `of("10")` | `InvalidPercentageError` |
| DS1 | Porcentaje 1000 sobre 14500 | `1450` |
| DS2 | Porcentaje 333 sobre 14500 | `483` |
| DS3 | Fijo 5000 sobre 14500 | `5000` |
| DS4 | Fijo 20000 sobre 14500 | `14500` (topado) |
| DS5 | Cualquier descuento sobre 0 | `0` |
| DS6 | Fijo de `0` | `InvalidDiscountError` |
| DS7 | `kind` de cada variante | `percentage` / `fixedAmount` |
| TP1 | Porcentaje 1000 sobre 13050 | `1305` |
| TP2 | Porcentaje 1500 sobre 13050 | `1958` |
| TP3 | Fijo 2000 sobre 13050 y sobre 0 | `2000` en los dos |
| TP4 | Porcentaje sobre 0 | `0` |
| TP5 | Fijo de `0` | `InvalidTipError` |
| TP6 | `kind` de cada variante | `percentage` / `fixedAmount` |

### Cálculo

| Id | Dado | Entonces |
|----|------|----------|
| TT1 | Sin líneas, sin ajustes | todo `0`, `taxes` `[]`, `discount` y `tip` `null` |
| TT2 | L | `unitAmount` 6000 y 2500; `lineSubtotal` 12000 y 2500; la exclusión suma 0 |
| TT3 | L sin ajustes | subtotal 14500; taxes `[0 %: base 2500, 0]`, `[16 %: base 12000, 1920]`; total **16420** |
| TT4 | L + descuento 10 % | descuento 1450; bases **2250** (0 %) y 10800 (16 %); impuesto 1728; total **14778**. (Antes decía 1250; typo: reparto 0 % = 250 → base 2500 − 250 = 2250, como en el análisis §5.8.) |
| TT5 | L + descuento 10 % + propina 10 % | propina 1305; total **16083** |
| TT6 | L + descuento 10 % + propina 15 % | propina 1958; total **16736** |
| TT7 | L + descuento fijo 5000 | reparto 862 (0 %) y 4138 (16 %); impuesto 1258; total **10758**; `requested` 5000 |
| TT8 | L + fijo 20000; con propina 10 %; con propina fija 2000 | descuento 14500, impuesto 0, total 0; propina 0, total 0; total 2000 |
| TT9 | Dos líneas de 16 % y una de 0 % | dos filas de impuesto; orden 0 % y luego 16 % |
| TT10 | Tres líneas de 3 centavos a 16 % | impuesto `1` (grupo: 9 × 0.16 = 1.44); por línea habría dado `0` |
| TT11 | Tabla de 8 casos (TT3–TT8, TT10, uno con dos tasas y fijo) | en cada uno: bases = subtotal − descuento; reparto = descuento; total = subtotal − descuento + impuestos + propina |
| TT12 | L calculada 100 veces; L con las líneas al revés | resultados iguales campo por campo; mismo subtotal, impuestos y total |
| TT13 | Línea de `2_000_000_000` × 2 | `MoneyOverflowError`; no hay resultado |
| TT14 | El llamador muta los arreglos devueltos | otra llamada da lo mismo |

### Estados

| Id | Dado | Entonces |
|----|------|----------|
| ST1 | `OPEN`, `SENT_TO_KITCHEN`, `IN_KITCHEN`, `READY` | `canAdjustTotals` verdadero |
| ST2 | `CLOSED`, `CANCELLED` | falso |
| ST3 | Los 6 estados | coinciden con la tabla de la sección 6 del análisis escrita en el spec |

### Agregado

| Id | Dado | Entonces |
|----|------|----------|
| OA1 | `Order.open` | `discount` y `tip` `null` |
| OA2 | `setDiscount(10 %)` en `OPEN` | otra orden con el descuento; la original sin él; misma `version`, estado y líneas |
| OA3 | `setTip` en `SENT_TO_KITCHEN`, `IN_KITCHEN` y `READY` | funciona; líneas iguales |
| OA4 | `setDiscount` / `setTip` en `CANCELLED` y en `CLOSED` (vía `restore`) | `OrderTotalsNotAdjustableError` |
| OA5 | `setDiscount(null)`, `setTip(null)` | quita el ajuste |
| OA6 | `order.totals()` | igual a `calculateTotals` sobre sus líneas y ajustes |
| OA7 | `restore` con descuento y propina | los conserva |
| OA8 | Descuento 10 % y luego `addLine` | el descuento crece con el subtotal; un fijo sigue topado |
| OA9 | Con descuento y propina: `addLine`, `replaceLine`, `cancelLine`, `sendToKitchen`, `beginCooking`, `markReady`, `cancel` | cada resultado conserva `discount` y `tip` |
| OA10 | `allowedActions()` en cada estado | igual que en el Sprint 2 |

### Doble en memoria

| Id | Dado | Entonces |
|----|------|----------|
| RP9 | `save` con descuento y propina; `findById` | los trae; `version` + 1 |
| RP10 | `list` | cada orden trae sus ajustes |

### Casos de uso

| Id | Caso | Dado | Entonces |
|----|------|------|----------|
| CT1 | `CalculateTotals` | orden L | desglose de TT3 |
| CT2 | `CalculateTotals` | id ausente | `OrderNotFoundError` |
| CT3 | `CalculateTotals` | orden L cancelada | desglose completo; `canAdjustTotals` falso |
| CT4 | `CalculateTotals` | cualquiera | cero `save` |
| SD1 | `SetOrderDiscount` | `percentage` 1000 | un `save`; devuelve descuento 1450 |
| SD2 | `SetOrderDiscount` | `fixedAmount` 5000 | descuento 5000 |
| SD3 | `SetOrderDiscount` | `null` sobre una con descuento | un `save`; `discount` `null` |
| SD4 | `SetOrderDiscount` | `basisPoints` 0, 10001, 1.5 | `InvalidPercentageError`; cero `save` |
| SD5 | `SetOrderDiscount` | `amount` 0; -1; 1.5 | `InvalidDiscountError`; `InvalidMoneyError`; `InvalidMoneyError`; cero `save` |
| SD6 | `SetOrderDiscount` | `kind` `"coupon"` (sin tipo) | `InvalidDiscountError`; cero `save` |
| SD7 | `SetOrderDiscount` | orden `CANCELLED` con `basisPoints` 0 | `OrderTotalsNotAdjustableError` (el estado va antes); cero `save` |
| SD8 | `SetOrderDiscount` | id ausente | `OrderNotFoundError` |
| SD9 | `SetOrderDiscount` | otro `save` entre lectura y escritura | `OrderConcurrencyError`; el descuento no queda |
| SD10 | `SetOrderDiscount` | orden `IN_KITCHEN` | funciona; líneas y estado iguales |
| SD11 | Descuento y luego propina | — | los dos guardados; `version` 2 |
| SP1–SP10 | `SetOrderTip` | los mismos casos que SD1–SD10, uno a uno, con `InvalidTipError` y la propina | mismo resultado, sobre la propina |

### Red de seguridad

| Id | Entonces |
|----|----------|
| R1 | `domain/totals`, `domain/money`, `application/totals` no importan `@nestjs/*`, `drizzle-orm`, `postgres`, `zod` ni `infrastructure/` |
| R2 | `domain/totals` no importa `domain/order` |
| R3 | Sin `Math.round`, `toFixed`, `parseFloat` ni `/ 100` en `domain/totals` y `domain/money` |
| R4 | API test pasa; número mayor que 210; 22 skipped iguales |
| R5 | `typecheck` pasa |
| R6 | `git diff --name-only` no toca `interface/`, `app.module.ts`, `apps/web`; en `infrastructure/` solo el `null` del mapper |
| R7 | El diff de `order-status.ts` solo agrega `canAdjustTotals`; `allowedActions` igual |

```bash
rg "@nestjs|drizzle-orm|from 'postgres'|from 'zod'|infrastructure/" apps/api/src/domain/totals apps/api/src/domain/money apps/api/src/application/totals
rg "domain/order|\.\./order" apps/api/src/domain/totals
rg "Math\.round|toFixed|parseFloat|/ 100\b" apps/api/src/domain/totals apps/api/src/domain/money
```

Resultado esperado de los tres: vacío.

## 9. Qué no demuestra esta tarea

- Que el descuento y la propina sobrevivan un reinicio. Es la tarea 2.
- Que HTTP responda 409 al ajustar una orden cancelada. Es la tarea 2.
- Que la pantalla muestre el desglose. Es la tarea 3.

## 10. Hecho cuando

- [x] MN1–MN10, PC1–PC3, DS1–DS7, TP1–TP6, TT1–TT14 pasan
- [x] ST1–ST3, OA1–OA10, RP9–RP10 pasan; S1–S8, OR1–OR16 y RP1–RP8 del Sprint 2 siguen
- [x] CT1–CT4, SD1–SD11, SP1–SP10 pasan
- [x] Los controles de los pasos 1, 3, 5 y 6 fallaron al romper y pasaron al restaurar
- [x] R1–R7 se cumplen
- [x] Ningún caso escribe cuando el agregado lanza

## 11. Cierre

Cerrado el 4 de octubre de 2026.

| Prueba | Comando | Resultado |
|--------|---------|-----------|
| Línea base | paso 0 | API 210 + 22 skipped; web 36; typecheck OK (4 oct 2026) |
| R1–R3 | `rg` de la sección 8 | vacío en los tres (sin matches) |
| R4 | `env -u DATABASE_URL pnpm --filter @restaurante/api test` | **289** passed + **22** skipped |
| R5 | `pnpm --filter @restaurante/api typecheck` | OK |
| R6–R7 | `git diff --name-only` | Sin `interface/`, `app.module.ts`, `apps/web`. En `infrastructure/` solo `order.mapper.ts` (`discount: null`, `tip: null`). `order-status.ts` solo agrega `canAdjustTotals`; `allowedActions` sin cambio |
| Controles | pasos 1, 3, 5, 6 | MN5, TT10, TT4, OA9, RP9 fallaron al romper y pasaron al restaurar |

Siguiente tarea del sprint: `docs/dev/totales/02-persistencia-y-api/`.

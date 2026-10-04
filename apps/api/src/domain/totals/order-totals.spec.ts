import { describe, expect, it } from 'vitest';
import { TaxRate } from '../menu/tax-rate';
import { Money, MoneyOverflowError } from '../money/money';
import { Discount } from './discount';
import { calculateTotals, type OrderTotals, type TotalsLine } from './order-totals';
import { Percentage } from './percentage';
import { Tip } from './tip';

const rate0 = TaxRate.of(0);
const rate16 = TaxRate.of(1600);

function tacosLine(overrides: Partial<TotalsLine> = {}): TotalsLine {
  return {
    lineId: 'line-tacos',
    name: 'Tacos de suadero',
    quantity: 2,
    unitPrice: Money.of(4500, 'MXN'),
    extras: [Money.of(1500, 'MXN'), Money.zero('MXN')],
    taxRate: rate16,
    ...overrides,
  };
}

function aguaLine(overrides: Partial<TotalsLine> = {}): TotalsLine {
  return {
    lineId: 'line-agua',
    name: 'Agua de jamaica',
    quantity: 1,
    unitPrice: Money.of(2500, 'MXN'),
    extras: [],
    taxRate: rate0,
    ...overrides,
  };
}

function orderL(lines: readonly TotalsLine[] = [tacosLine(), aguaLine()]): {
  lines: readonly TotalsLine[];
  discount: Discount | null;
  tip: Tip | null;
} {
  return { lines, discount: null, tip: null };
}

function amounts(totals: OrderTotals) {
  return {
    subtotal: totals.subtotal.amount,
    discount: totals.discount?.amount.amount ?? null,
    requested: totals.discount?.requested?.amount ?? null,
    taxes: totals.taxes.map((tax) => ({
      rate: tax.taxRate.basisPoints,
      base: tax.taxableBase.amount,
      amount: tax.amount.amount,
    })),
    taxTotal: totals.taxTotal.amount,
    tip: totals.tip?.amount.amount ?? null,
    total: totals.total.amount,
  };
}

function assertInvariants(totals: OrderTotals): void {
  const discountAmount = totals.discount?.amount ?? Money.zero('MXN');
  const tipAmount = totals.tip?.amount ?? Money.zero('MXN');
  const bases = totals.taxes.reduce(
    (sum, tax) => sum.add(tax.taxableBase),
    Money.zero('MXN'),
  );
  const expectedBases = totals.subtotal.subtract(discountAmount);

  expect(bases.equals(expectedBases)).toBe(true);
  expect(
    totals.subtotal
      .subtract(discountAmount)
      .add(totals.taxTotal)
      .add(tipAmount)
      .equals(totals.total),
  ).toBe(true);
  expect(totals.subtotal.amount).toBeGreaterThanOrEqual(0);
  expect(discountAmount.amount).toBeGreaterThanOrEqual(0);
  expect(totals.taxTotal.amount).toBeGreaterThanOrEqual(0);
  expect(tipAmount.amount).toBeGreaterThanOrEqual(0);
  expect(totals.total.amount).toBeGreaterThanOrEqual(0);
}

describe('calculateTotals', () => {
  it('returns zeros with no lines and no adjustments (TT1)', () => {
    const totals = calculateTotals({ lines: [], discount: null, tip: null });

    expect(totals.lines).toEqual([]);
    expect(totals.subtotal.amount).toBe(0);
    expect(totals.discount).toBeNull();
    expect(totals.taxes).toEqual([]);
    expect(totals.taxTotal.amount).toBe(0);
    expect(totals.tip).toBeNull();
    expect(totals.total.amount).toBe(0);
  });

  it('computes unit and line amounts; exclusion adds zero (TT2)', () => {
    const totals = calculateTotals(orderL());

    expect(totals.lines[0]!.unitAmount.amount).toBe(6000);
    expect(totals.lines[0]!.lineSubtotal.amount).toBe(12000);
    expect(totals.lines[1]!.unitAmount.amount).toBe(2500);
    expect(totals.lines[1]!.lineSubtotal.amount).toBe(2500);
  });

  it('calculates L without adjustments (TT3)', () => {
    const totals = calculateTotals(orderL());

    expect(amounts(totals)).toEqual({
      subtotal: 14500,
      discount: null,
      requested: null,
      taxes: [
        { rate: 0, base: 2500, amount: 0 },
        { rate: 1600, base: 12000, amount: 1920 },
      ],
      taxTotal: 1920,
      tip: null,
      total: 16420,
    });
  });

  it('applies a 10 percent discount before tax (TT4)', () => {
    const totals = calculateTotals({
      ...orderL(),
      discount: Discount.percentage(Percentage.of(1000)),
    });

    expect(amounts(totals)).toEqual({
      subtotal: 14500,
      discount: 1450,
      requested: null,
      taxes: [
        { rate: 0, base: 2250, amount: 0 },
        { rate: 1600, base: 10800, amount: 1728 },
      ],
      taxTotal: 1728,
      tip: null,
      total: 14778,
    });
  });

  it('adds a 10 percent tip after discount (TT5)', () => {
    const totals = calculateTotals({
      ...orderL(),
      discount: Discount.percentage(Percentage.of(1000)),
      tip: Tip.percentage(Percentage.of(1000)),
    });

    expect(totals.tip!.amount.amount).toBe(1305);
    expect(totals.total.amount).toBe(16083);
  });

  it('adds a 15 percent tip with half-up rounding (TT6)', () => {
    const totals = calculateTotals({
      ...orderL(),
      discount: Discount.percentage(Percentage.of(1000)),
      tip: Tip.percentage(Percentage.of(1500)),
    });

    expect(totals.tip!.amount.amount).toBe(1958);
    expect(totals.total.amount).toBe(16736);
  });

  it('allocates a fixed discount by largest remainder (TT7)', () => {
    const totals = calculateTotals({
      ...orderL(),
      discount: Discount.fixedAmount(Money.of(5000, 'MXN')),
    });

    expect(amounts(totals)).toEqual({
      subtotal: 14500,
      discount: 5000,
      requested: 5000,
      taxes: [
        { rate: 0, base: 2500 - 862, amount: 0 },
        { rate: 1600, base: 12000 - 4138, amount: 1258 },
      ],
      taxTotal: 1258,
      tip: null,
      total: 10758,
    });
  });

  it('caps an oversized fixed discount and handles tips on a zero base (TT8)', () => {
    const capped = calculateTotals({
      ...orderL(),
      discount: Discount.fixedAmount(Money.of(20000, 'MXN')),
    });
    expect(amounts(capped)).toMatchObject({
      discount: 14500,
      requested: 20000,
      taxes: [
        { rate: 0, base: 0, amount: 0 },
        { rate: 1600, base: 0, amount: 0 },
      ],
      taxTotal: 0,
      total: 0,
    });

    const withPercentTip = calculateTotals({
      ...orderL(),
      discount: Discount.fixedAmount(Money.of(20000, 'MXN')),
      tip: Tip.percentage(Percentage.of(1000)),
    });
    expect(withPercentTip.tip!.amount.amount).toBe(0);
    expect(withPercentTip.total.amount).toBe(0);

    const withFixedTip = calculateTotals({
      ...orderL(),
      discount: Discount.fixedAmount(Money.of(20000, 'MXN')),
      tip: Tip.fixedAmount(Money.of(2000, 'MXN')),
    });
    expect(withFixedTip.total.amount).toBe(2000);
  });

  it('groups taxes ascending and merges same rates (TT9)', () => {
    const totals = calculateTotals({
      lines: [
        tacosLine({ lineId: 'a' }),
        tacosLine({ lineId: 'b', quantity: 1 }),
        aguaLine(),
      ],
      discount: null,
      tip: null,
    });

    expect(totals.taxes.map((tax) => tax.taxRate.basisPoints)).toEqual([0, 1600]);
    expect(totals.taxes).toHaveLength(2);
  });

  it('rounds tax once per rate group (TT10)', () => {
    const totals = calculateTotals({
      lines: [1, 2, 3].map((n) => ({
        lineId: `c${n}`,
        name: 'Centavo',
        quantity: 1,
        unitPrice: Money.of(3, 'MXN'),
        extras: [],
        taxRate: rate16,
      })),
      discount: null,
      tip: null,
    });

    expect(totals.subtotal.amount).toBe(9);
    expect(totals.taxTotal.amount).toBe(1);
  });

  it('keeps invariants across the worked cases (TT11)', () => {
    const cases: Array<{ lines: readonly TotalsLine[]; discount: Discount | null; tip: Tip | null }> = [
      orderL(),
      { ...orderL(), discount: Discount.percentage(Percentage.of(1000)) },
      {
        ...orderL(),
        discount: Discount.percentage(Percentage.of(1000)),
        tip: Tip.percentage(Percentage.of(1000)),
      },
      {
        ...orderL(),
        discount: Discount.percentage(Percentage.of(1000)),
        tip: Tip.percentage(Percentage.of(1500)),
      },
      { ...orderL(), discount: Discount.fixedAmount(Money.of(5000, 'MXN')) },
      { ...orderL(), discount: Discount.fixedAmount(Money.of(20000, 'MXN')) },
      {
        lines: [1, 2, 3].map((n) => ({
          lineId: `c${n}`,
          name: 'Centavo',
          quantity: 1,
          unitPrice: Money.of(3, 'MXN'),
          extras: [],
          taxRate: rate16,
        })),
        discount: null,
        tip: null,
      },
      {
        ...orderL(),
        discount: Discount.fixedAmount(Money.of(5000, 'MXN')),
        tip: Tip.fixedAmount(Money.of(2000, 'MXN')),
      },
    ];

    for (const input of cases) {
      assertInvariants(calculateTotals(input));
    }
  });

  it('is deterministic and independent of line order (TT12)', () => {
    const forward = calculateTotals(orderL());
    for (let i = 0; i < 100; i += 1) {
      expect(amounts(calculateTotals(orderL()))).toEqual(amounts(forward));
    }

    const reversed = calculateTotals(orderL([aguaLine(), tacosLine()]));
    expect(reversed.subtotal.amount).toBe(forward.subtotal.amount);
    expect(reversed.taxTotal.amount).toBe(forward.taxTotal.amount);
    expect(reversed.total.amount).toBe(forward.total.amount);
    expect(amounts(reversed).taxes).toEqual(amounts(forward).taxes);
  });

  it('surfaces overflow from line multiplication (TT13)', () => {
    expect(() =>
      calculateTotals({
        lines: [
          {
            lineId: 'huge',
            name: 'Huge',
            quantity: 2,
            unitPrice: Money.of(2_000_000_000, 'MXN'),
            extras: [],
            taxRate: rate16,
          },
        ],
        discount: null,
        tip: null,
      }),
    ).toThrow(MoneyOverflowError);
  });

  it('is unaffected when the caller mutates returned arrays (TT14)', () => {
    const first = calculateTotals(orderL());
    first.lines.push({
      lineId: 'mutated',
      name: 'Mutated',
      quantity: 1,
      unitAmount: Money.of(1, 'MXN'),
      lineSubtotal: Money.of(1, 'MXN'),
      taxRate: rate16,
    });
    first.taxes.pop();

    const second = calculateTotals(orderL());
    expect(amounts(second)).toEqual(amounts(calculateTotals(orderL())));
    expect(second.lines).toHaveLength(2);
    expect(second.taxes).toHaveLength(2);
  });
});

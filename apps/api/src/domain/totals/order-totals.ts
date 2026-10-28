import { TaxRate } from '../menu/tax-rate';
import { Money } from '../money/money';
import type { Discount } from './discount';
import type { Tip } from './tip';

const CURRENCY = 'MXN';
const MAX_MONEY = Money.of(2_147_483_647, CURRENCY);

export type TotalsLine = {
  lineId: string;
  name: string;
  quantity: number;
  unitPrice: Money;
  extras: readonly Money[];
  taxRate: TaxRate;
};

export type OrderTotalsLine = {
  lineId: string;
  name: string;
  quantity: number;
  unitAmount: Money;
  lineSubtotal: Money;
  taxRate: TaxRate;
};

export type OrderTotals = {
  lines: OrderTotalsLine[];
  subtotal: Money;
  discount: { discount: Discount; requested: Money | null; amount: Money } | null;
  taxes: { taxRate: TaxRate; taxableBase: Money; amount: Money }[];
  taxTotal: Money;
  tip: { tip: Tip; amount: Money } | null;
  total: Money;
};

export function calculateTotals(input: {
  lines: readonly TotalsLine[];
  discount: Discount | null;
  tip: Tip | null;
}): OrderTotals {
  const lines = input.lines.map((line) => {
    const unitAmount = line.extras.reduce(
      (sum, extra) => sum.add(extra),
      line.unitPrice,
    );
    return {
      lineId: line.lineId,
      name: line.name,
      quantity: line.quantity,
      unitAmount,
      lineSubtotal: unitAmount.times(line.quantity),
      taxRate: line.taxRate,
    };
  });

  const subtotal = lines.reduce(
    (sum, line) => sum.add(line.lineSubtotal),
    Money.zero(CURRENCY),
  );

  const discountAmount = input.discount
    ? input.discount.amountFor(subtotal)
    : Money.zero(CURRENCY);

  const discount =
    input.discount === null
      ? null
      : {
          discount: input.discount,
          requested:
            input.discount.kind === 'fixedAmount'
              ? input.discount.amountFor(MAX_MONEY)
              : null,
          amount: discountAmount,
        };

  const groups = new Map<number, { taxRate: TaxRate; base: Money }>();
  for (const line of lines) {
    const key = line.taxRate.basisPoints;
    const existing = groups.get(key);
    if (existing) {
      groups.set(key, {
        taxRate: existing.taxRate,
        base: existing.base.add(line.lineSubtotal),
      });
    } else {
      groups.set(key, { taxRate: line.taxRate, base: line.lineSubtotal });
    }
  }

  const groupsSorted = [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, group]) => group);

  const allocated =
    groupsSorted.length === 0
      ? []
      : discountAmount.allocate(groupsSorted.map((group) => group.base.amount));

  const taxes = groupsSorted.map((group, index) => {
    const share = allocated[index] ?? Money.zero(CURRENCY);
    const taxableBase = group.base.subtract(share);
    return {
      taxRate: group.taxRate,
      taxableBase,
      amount: taxableBase.percentage(group.taxRate.basisPoints),
    };
  });

  const taxTotal = taxes.reduce(
    (sum, tax) => sum.add(tax.amount),
    Money.zero(CURRENCY),
  );

  const afterDiscount = subtotal.subtract(discountAmount);
  const tipAmount = input.tip ? input.tip.amountFor(afterDiscount) : Money.zero(CURRENCY);
  const tip = input.tip === null ? null : { tip: input.tip, amount: tipAmount };

  return {
    lines: lines.map((line) => ({ ...line })),
    subtotal,
    discount,
    taxes: taxes.map((tax) => ({ ...tax })),
    taxTotal,
    tip,
    total: afterDiscount.add(taxTotal).add(tipAmount),
  };
}

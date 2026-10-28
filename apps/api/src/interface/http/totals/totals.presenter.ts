import { Money } from '../../../domain/money/money';
import type { OrderTotals } from '../../../domain/totals/order-totals';

const PERCENTAGE_PROBE = Money.of(10_000, 'MXN');

export function presentOrderTotals(input: {
  orderId: string;
  adjustable: boolean;
  totals: OrderTotals;
}) {
  const { orderId, adjustable, totals } = input;
  const currency = totals.subtotal.currency;

  return {
    orderId,
    currency,
    adjustable,
    lines: totals.lines.map((line) => ({
      lineId: line.lineId,
      name: line.name,
      quantity: line.quantity,
      unitAmount: presentMoney(line.unitAmount),
      lineSubtotal: presentMoney(line.lineSubtotal),
      applicableTax: { basisPoints: line.taxRate.basisPoints },
    })),
    subtotal: presentMoney(totals.subtotal),
    discount: presentDiscount(totals.discount),
    taxes: totals.taxes.map((tax) => ({
      basisPoints: tax.taxRate.basisPoints,
      taxableBase: presentMoney(tax.taxableBase),
      amount: presentMoney(tax.amount),
    })),
    taxTotal: presentMoney(totals.taxTotal),
    tip: presentTip(totals.tip),
    total: presentMoney(totals.total),
  };
}

function presentDiscount(discount: OrderTotals['discount']) {
  if (discount === null) {
    return null;
  }

  if (discount.discount.kind === 'percentage') {
    return {
      kind: 'percentage' as const,
      basisPoints: discount.discount.amountFor(PERCENTAGE_PROBE).amount,
      amount: presentMoney(discount.amount),
    };
  }

  return {
    kind: 'fixedAmount' as const,
    requested: presentMoney(discount.requested ?? discount.amount),
    amount: presentMoney(discount.amount),
  };
}

function presentTip(tip: OrderTotals['tip']) {
  if (tip === null) {
    return null;
  }

  if (tip.tip.kind === 'percentage') {
    return {
      kind: 'percentage' as const,
      basisPoints: tip.tip.amountFor(PERCENTAGE_PROBE).amount,
      amount: presentMoney(tip.amount),
    };
  }

  return {
    kind: 'fixedAmount' as const,
    amount: presentMoney(tip.amount),
  };
}

function presentMoney(money: Money) {
  return {
    amount: money.amount,
    currency: money.currency,
  };
}

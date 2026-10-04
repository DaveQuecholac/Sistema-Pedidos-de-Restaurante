import type { InferSelectModel } from 'drizzle-orm';
import { OrderMappingError } from '../../../application/order/order-repository.errors';
import {
  BlankIdError,
  BlankNameError,
  ExclusionHasPriceError,
  ExtraMissingPriceError,
  InvalidModifierKindError,
} from '../../../domain/menu/menu-item.errors';
import { InvalidTaxRateError, TaxRate } from '../../../domain/menu/tax-rate';
import { InvalidMoneyError, Money } from '../../../domain/money/money';
import { LineItem, type LineModifierRestoreInput } from '../../../domain/order/line-item';
import { Order } from '../../../domain/order/order';
import {
  DuplicateLineItemIdError,
  InvalidExternalOrderIdError,
  InvalidOrderStatusError,
  InvalidOrderVersionError,
  InvalidQuantityError,
  InvalidTableIdError,
} from '../../../domain/order/order.errors';
import { OrderOrigin } from '../../../domain/order/order-origin';
import { Quantity } from '../../../domain/order/quantity';
import { Discount } from '../../../domain/totals/discount';
import { Percentage } from '../../../domain/totals/percentage';
import { Tip } from '../../../domain/totals/tip';
import {
  InvalidDiscountError,
  InvalidPercentageError,
  InvalidTipError,
} from '../../../domain/totals/totals.errors';
import { orderLineModifiers, orderLines, orders } from './schema/order';

export type OrderRow = InferSelectModel<typeof orders>;
export type OrderLineRow = InferSelectModel<typeof orderLines>;
export type OrderLineModifierRow = InferSelectModel<typeof orderLineModifiers>;

const PERCENTAGE_PROBE = Money.of(10_000, 'MXN');
const FIXED_PROBE = Money.of(2_147_483_647, 'MXN');

export function toOrder(
  order: OrderRow,
  lines: readonly OrderLineRow[],
  modifiers: readonly OrderLineModifierRow[],
): Order {
  try {
    const modifiersByLine = groupModifiers(modifiers);

    return Order.restore({
      id: order.id,
      origin: toOrigin(order),
      status: order.status,
      openedAt: order.openedAt,
      version: order.version,
      lines: lines.map((line) => {
        const stored = modifiersByLine.get(line.id);
        return toLine(line, stored === undefined ? [] : stored);
      }),
      discount: toDiscount(order),
      tip: toTip(order),
    });
  } catch (error) {
    if (isOrderRuleError(error)) {
      throw new OrderMappingError();
    }
    throw error;
  }
}

export function toOrderRow(order: Order): OrderRow {
  return {
    id: order.id,
    tableId: order.origin.tableId,
    externalOrderId: order.origin.externalOrderId,
    status: order.status,
    openedAt: order.openedAt,
    version: order.version,
    ...toDiscountColumns(order.discount),
    ...toTipColumns(order.tip),
  };
}

export function toDiscountColumns(discount: Discount | null): Pick<
  OrderRow,
  'discountKind' | 'discountBasisPoints' | 'discountAmount' | 'discountCurrency'
> {
  if (discount === null) {
    return {
      discountKind: null,
      discountBasisPoints: null,
      discountAmount: null,
      discountCurrency: null,
    };
  }

  if (discount.kind === 'percentage') {
    return {
      discountKind: 'percentage',
      discountBasisPoints: discount.amountFor(PERCENTAGE_PROBE).amount,
      discountAmount: null,
      discountCurrency: null,
    };
  }

  const amount = discount.amountFor(FIXED_PROBE);
  return {
    discountKind: 'fixedAmount',
    discountBasisPoints: null,
    discountAmount: amount.amount,
    discountCurrency: amount.currency,
  };
}

export function toTipColumns(tip: Tip | null): Pick<
  OrderRow,
  'tipKind' | 'tipBasisPoints' | 'tipAmount' | 'tipCurrency'
> {
  if (tip === null) {
    return {
      tipKind: null,
      tipBasisPoints: null,
      tipAmount: null,
      tipCurrency: null,
    };
  }

  if (tip.kind === 'percentage') {
    return {
      tipKind: 'percentage',
      tipBasisPoints: tip.amountFor(PERCENTAGE_PROBE).amount,
      tipAmount: null,
      tipCurrency: null,
    };
  }

  const amount = tip.amountFor(FIXED_PROBE);
  return {
    tipKind: 'fixedAmount',
    tipBasisPoints: null,
    tipAmount: amount.amount,
    tipCurrency: amount.currency,
  };
}

function toDiscount(order: OrderRow): Discount | null {
  if (order.discountKind === null) {
    if (
      order.discountBasisPoints !== null ||
      order.discountAmount !== null ||
      order.discountCurrency !== null
    ) {
      throw new OrderMappingError();
    }
    return null;
  }

  if (order.discountKind === 'percentage') {
    if (
      order.discountBasisPoints === null ||
      order.discountAmount !== null ||
      order.discountCurrency !== null
    ) {
      throw new OrderMappingError();
    }
    return Discount.percentage(Percentage.of(order.discountBasisPoints));
  }

  if (order.discountKind === 'fixedAmount') {
    if (
      order.discountAmount === null ||
      order.discountCurrency === null ||
      order.discountBasisPoints !== null
    ) {
      throw new OrderMappingError();
    }
    return Discount.fixedAmount(Money.of(order.discountAmount, order.discountCurrency));
  }

  throw new OrderMappingError();
}

function toTip(order: OrderRow): Tip | null {
  if (order.tipKind === null) {
    if (
      order.tipBasisPoints !== null ||
      order.tipAmount !== null ||
      order.tipCurrency !== null
    ) {
      throw new OrderMappingError();
    }
    return null;
  }

  if (order.tipKind === 'percentage') {
    if (
      order.tipBasisPoints === null ||
      order.tipAmount !== null ||
      order.tipCurrency !== null
    ) {
      throw new OrderMappingError();
    }
    return Tip.percentage(Percentage.of(order.tipBasisPoints));
  }

  if (order.tipKind === 'fixedAmount') {
    if (
      order.tipAmount === null ||
      order.tipCurrency === null ||
      order.tipBasisPoints !== null
    ) {
      throw new OrderMappingError();
    }
    return Tip.fixedAmount(Money.of(order.tipAmount, order.tipCurrency));
  }

  throw new OrderMappingError();
}

function toOrigin(order: OrderRow): OrderOrigin {
  if (order.tableId !== null && order.externalOrderId === null) {
    return OrderOrigin.table(order.tableId);
  }

  if (order.tableId === null && order.externalOrderId !== null) {
    return OrderOrigin.external(order.externalOrderId);
  }

  throw new OrderMappingError();
}

function toLine(line: OrderLineRow, modifiers: readonly OrderLineModifierRow[]): LineItem {
  return LineItem.restore({
    id: line.id,
    menuItemId: line.menuItemId,
    name: line.name,
    unitPrice: Money.of(line.unitPriceAmount, line.unitPriceCurrency),
    applicableTax: TaxRate.of(line.taxBasisPoints),
    quantity: Quantity.of(line.quantity),
    modifiers: modifiers.map(toModifier),
  });
}

function toModifier(row: OrderLineModifierRow): LineModifierRestoreInput {
  return {
    modifierId: row.modifierId,
    name: row.name,
    kind: row.kind,
    price: storedPrice(row.priceAmount, row.priceCurrency),
  };
}

function storedPrice(amount: number | null, currency: string | null): Money | null {
  if (amount === null && currency === null) {
    return null;
  }

  if (amount === null || currency === null) {
    throw new OrderMappingError();
  }

  return Money.of(amount, currency);
}

function groupModifiers(rows: readonly OrderLineModifierRow[]): Map<string, OrderLineModifierRow[]> {
  const grouped = new Map<string, OrderLineModifierRow[]>();

  for (const row of rows) {
    const current = grouped.get(row.orderLineId);
    if (current === undefined) {
      grouped.set(row.orderLineId, [row]);
    } else {
      current.push(row);
    }
  }

  return grouped;
}

function isOrderRuleError(error: unknown): boolean {
  return (
    error instanceof OrderMappingError ||
    error instanceof InvalidMoneyError ||
    error instanceof InvalidTaxRateError ||
    error instanceof InvalidQuantityError ||
    error instanceof InvalidOrderStatusError ||
    error instanceof InvalidOrderVersionError ||
    error instanceof InvalidTableIdError ||
    error instanceof InvalidExternalOrderIdError ||
    error instanceof ExtraMissingPriceError ||
    error instanceof ExclusionHasPriceError ||
    error instanceof InvalidModifierKindError ||
    error instanceof DuplicateLineItemIdError ||
    error instanceof BlankNameError ||
    error instanceof BlankIdError ||
    error instanceof InvalidPercentageError ||
    error instanceof InvalidDiscountError ||
    error instanceof InvalidTipError
  );
}

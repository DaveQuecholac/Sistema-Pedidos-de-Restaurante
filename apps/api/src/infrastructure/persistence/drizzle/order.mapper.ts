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
import { orderLineModifiers, orderLines, orders } from './schema/order';

export type OrderRow = InferSelectModel<typeof orders>;
export type OrderLineRow = InferSelectModel<typeof orderLines>;
export type OrderLineModifierRow = InferSelectModel<typeof orderLineModifiers>;

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
      discount: null,
      tip: null,
    });
  } catch (error) {
    if (isOrderRuleError(error)) {
      throw new OrderMappingError();
    }
    throw error;
  }
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
    error instanceof BlankIdError
  );
}

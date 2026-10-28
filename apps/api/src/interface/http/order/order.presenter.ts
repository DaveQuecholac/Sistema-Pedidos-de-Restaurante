import type { LineItem, LineModifier } from '../../../domain/order/line-item';
import type { Order } from '../../../domain/order/order';

export function presentOrder(order: Order) {
  return {
    id: order.id,
    tableId: order.origin.tableId,
    externalOrderId: order.origin.externalOrderId,
    status: order.status,
    openedAt: order.openedAt.toISOString(),
    allowedActions: order.allowedActions(),
    lines: order.lines.map(presentLine),
  };
}

function presentLine(line: LineItem) {
  return {
    id: line.id,
    menuItemId: line.menuItemId,
    name: line.name,
    quantity: line.quantity.amount,
    unitPrice: {
      amount: line.unitPrice.amount,
      currency: line.unitPrice.currency,
    },
    applicableTax: {
      basisPoints: line.applicableTax.basisPoints,
    },
    modifiers: line.modifiers.map(presentModifier),
  };
}

function presentModifier(modifier: LineModifier) {
  return {
    modifierId: modifier.modifierId,
    name: modifier.name,
    kind: modifier.kind,
    price:
      modifier.price === null
        ? null
        : {
            amount: modifier.price.amount,
            currency: modifier.price.currency,
          },
  };
}

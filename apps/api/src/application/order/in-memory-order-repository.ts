import { LineItem } from '../../domain/order/line-item';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import { ACTIVE_ORDER_STATUSES, type OrderStatus } from '../../domain/order/order-status';
import type { OrderRepository } from '../ports/order-repository';
import {
  OrderAlreadyExistsError,
  OrderConcurrencyError,
  OrderNotFoundError,
} from './order-repository.errors';

/** Test double. Increments version on save and never hands out the stored object. */
export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>();

  async add(order: Order): Promise<void> {
    if (this.orders.has(order.id)) {
      throw new OrderAlreadyExistsError();
    }

    this.orders.set(order.id, copy(order));
  }

  async save(order: Order): Promise<void> {
    const stored = this.orders.get(order.id);
    if (stored === undefined) {
      throw new OrderNotFoundError();
    }
    if (stored.version !== order.version) {
      throw new OrderConcurrencyError();
    }

    this.orders.set(order.id, copy(order, order.version + 1));
  }

  async findById(id: string): Promise<Order | null> {
    const stored = this.orders.get(id);
    return stored === undefined ? null : copy(stored);
  }

  async findByExternalOrderId(externalOrderId: string): Promise<Order | null> {
    for (const order of this.orders.values()) {
      if (order.origin.externalOrderId === externalOrderId) {
        return copy(order);
      }
    }
    return null;
  }

  async findActiveByTableId(tableId: string): Promise<Order | null> {
    const active = new Set<OrderStatus>(ACTIVE_ORDER_STATUSES);
    for (const order of this.orders.values()) {
      if (order.origin.tableId === tableId && active.has(order.status)) {
        return copy(order);
      }
    }
    return null;
  }

  async list(filter: { statuses: readonly OrderStatus[] | null }): Promise<Order[]> {
    let orders = [...this.orders.values()];

    if (filter.statuses !== null) {
      const allowed = new Set(filter.statuses);
      orders = orders.filter((order) => allowed.has(order.status));
    }

    orders.sort((left, right) => {
      const byTime = left.openedAt.getTime() - right.openedAt.getTime();
      if (byTime !== 0) {
        return byTime;
      }
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });

    return orders.map((order) => copy(order));
  }
}

function copy(order: Order, version = order.version): Order {
  return Order.restore({
    id: order.id,
    origin: copyOrigin(order.origin),
    status: order.status,
    openedAt: order.openedAt,
    lines: order.lines.map(copyLine),
    version,
    discount: order.discount,
    tip: order.tip,
    payment: order.payment,
  });
}

function copyOrigin(origin: OrderOrigin): OrderOrigin {
  if (origin.tableId !== null) {
    return OrderOrigin.table(origin.tableId);
  }
  if (origin.externalOrderId === null) {
    throw new Error('Order origin is missing both tableId and externalOrderId');
  }
  return OrderOrigin.external(origin.externalOrderId);
}

function copyLine(line: LineItem): LineItem {
  return LineItem.restore({
    id: line.id,
    menuItemId: line.menuItemId,
    name: line.name,
    unitPrice: line.unitPrice,
    applicableTax: line.applicableTax,
    quantity: line.quantity,
    modifiers: line.modifiers.map((modifier) => ({
      modifierId: modifier.modifierId,
      name: modifier.name,
      kind: modifier.kind,
      price: modifier.price,
    })),
  });
}

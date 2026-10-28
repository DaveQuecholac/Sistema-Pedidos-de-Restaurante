import type { Order } from '../order/order';
import type { Discount } from './discount';
import { calculateTotals, type OrderTotals } from './order-totals';
import type { Tip } from './tip';

/** Comandas that still belong on the table bill. */
export function billableOrders(orders: readonly Order[]): Order[] {
  return orders.filter((order) => order.status !== 'CANCELLED' && order.status !== 'CLOSED');
}

/** One account: every open comanda's lines, then a single discount and a single tip. */
export function tableAccountTotals(input: {
  orders: readonly Order[];
  discount: Discount | null;
  tip: Tip | null;
}): OrderTotals {
  const lines = billableOrders(input.orders).flatMap((order) => order.lineContributions());
  return calculateTotals({
    lines,
    discount: input.discount,
    tip: input.tip,
  });
}

export function tableAccountCanClose(orders: readonly Order[]): boolean {
  const billable = billableOrders(orders);
  return billable.length > 0 && billable.every((order) => order.status === 'READY');
}

import { Order } from '../../domain/order/order';
import type { OrderStatus } from '../../domain/order/order-status';
import type { OrderRepository } from '../ports/order-repository';

export type ListOrdersQuery = {
  statuses: OrderStatus[] | null;
};

export class ListOrders {
  constructor(private readonly orders: OrderRepository) {}

  async execute(query: ListOrdersQuery): Promise<Order[]> {
    return this.orders.list({ statuses: query.statuses });
  }
}

import { Order } from '../../domain/order/order';
import type { OrderRepository } from '../ports/order-repository';
import { OrderNotFoundError } from './order-repository.errors';

export class GetOrder {
  constructor(private readonly orders: OrderRepository) {}

  async execute(orderId: string): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (order === null) {
      throw new OrderNotFoundError();
    }
    return order;
  }
}

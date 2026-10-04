import type { OrderTotals } from '../../domain/totals/order-totals';
import { OrderNotFoundError } from '../order/order-repository.errors';
import type { OrderRepository } from '../ports/order-repository';

export class CalculateTotals {
  constructor(private readonly orders: OrderRepository) {}

  async execute(orderId: string): Promise<OrderTotals> {
    const order = await this.orders.findById(orderId);
    if (order === null) {
      throw new OrderNotFoundError();
    }
    return order.totals();
  }
}

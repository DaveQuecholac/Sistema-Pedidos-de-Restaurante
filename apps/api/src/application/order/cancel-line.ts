import { Order } from '../../domain/order/order';
import type { OrderRepository } from '../ports/order-repository';
import { OrderNotFoundError } from './order-repository.errors';

export type CancelLineCommand = {
  orderId: string;
  lineId: string;
};

export class CancelLine {
  constructor(private readonly orders: OrderRepository) {}

  async execute(command: CancelLineCommand): Promise<Order> {
    const order = await this.orders.findById(command.orderId);
    if (order === null) {
      throw new OrderNotFoundError();
    }

    const updated = order.cancelLine(command.lineId);
    await this.orders.save(updated);
    const saved = await this.orders.findById(updated.id);
    if (saved === null) {
      throw new OrderNotFoundError();
    }
    return saved;
  }
}

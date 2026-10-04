import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import type { OrderRepository } from '../ports/order-repository';
import { ExternalOrderIdInUseError } from './order-repository.errors';

export type OpenOrderCommand = {
  tableId?: string;
  externalOrderId?: string;
};

export class OpenOrder {
  constructor(
    private readonly orders: OrderRepository,
    private readonly generateId: () => string,
    private readonly now: () => Date,
  ) {}

  async execute(command: OpenOrderCommand): Promise<Order> {
    const origin = OrderOrigin.fromInput(command);

    if (origin.externalOrderId !== null) {
      const existing = await this.orders.findByExternalOrderId(origin.externalOrderId);
      if (existing !== null) {
        throw new ExternalOrderIdInUseError();
      }
    }

    const order = Order.open({
      id: this.generateId(),
      origin,
      openedAt: this.now(),
    });

    await this.orders.add(order);
    return order;
  }
}

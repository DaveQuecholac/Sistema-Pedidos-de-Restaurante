import type { Payment } from '../../domain/payment/payment';
import { OrderNotFoundError } from '../order/order-repository.errors';
import type { OrderRepository } from '../ports/order-repository';
import { PaymentNotFoundError } from './payment.errors';

export class GetOrderPayment {
  constructor(private readonly orders: OrderRepository) {}

  async execute(orderId: string): Promise<Payment> {
    const order = await this.orders.findById(orderId);
    if (order === null) {
      throw new OrderNotFoundError();
    }
    if (order.payment === null) {
      throw new PaymentNotFoundError();
    }
    return order.payment;
  }
}

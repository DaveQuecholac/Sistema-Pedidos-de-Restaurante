import { OrderTotalsNotAdjustableError } from '../../domain/order/order.errors';
import type { OrderTotals } from '../../domain/totals/order-totals';
import { OrderNotFoundError } from '../order/order-repository.errors';
import type { OrderRepository } from '../ports/order-repository';
import { toDiscount, type AdjustmentCommand } from './adjustment-command';

export type SetOrderDiscountCommand = {
  orderId: string;
  discount: AdjustmentCommand | null;
};

export class SetOrderDiscount {
  constructor(private readonly orders: OrderRepository) {}

  async execute(command: SetOrderDiscountCommand): Promise<OrderTotals> {
    const order = await this.orders.findById(command.orderId);
    if (order === null) {
      throw new OrderNotFoundError();
    }
    if (!order.canAdjustTotals()) {
      throw new OrderTotalsNotAdjustableError();
    }

    const discount = command.discount === null ? null : toDiscount(command.discount);
    const updated = order.setDiscount(discount);
    await this.orders.save(updated);

    const saved = await this.orders.findById(updated.id);
    if (saved === null) {
      throw new OrderNotFoundError();
    }
    return saved.totals();
  }
}

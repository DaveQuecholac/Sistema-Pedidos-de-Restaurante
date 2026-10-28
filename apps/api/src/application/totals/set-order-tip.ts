import { OrderTotalsNotAdjustableError } from '../../domain/order/order.errors';
import type { OrderTotals } from '../../domain/totals/order-totals';
import { OrderNotFoundError } from '../order/order-repository.errors';
import type { OrderRepository } from '../ports/order-repository';
import { toTip, type AdjustmentCommand } from './adjustment-command';

export type SetOrderTipCommand = {
  orderId: string;
  tip: AdjustmentCommand | null;
};

export class SetOrderTip {
  constructor(private readonly orders: OrderRepository) {}

  async execute(command: SetOrderTipCommand): Promise<OrderTotals> {
    const order = await this.orders.findById(command.orderId);
    if (order === null) {
      throw new OrderNotFoundError();
    }
    if (!order.canAdjustTotals()) {
      throw new OrderTotalsNotAdjustableError();
    }

    const tip = command.tip === null ? null : toTip(command.tip);
    const updated = order.setTip(tip);
    await this.orders.save(updated);

    const saved = await this.orders.findById(updated.id);
    if (saved === null) {
      throw new OrderNotFoundError();
    }
    return saved.totals();
  }
}

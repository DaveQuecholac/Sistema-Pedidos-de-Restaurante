import type { Order } from '../../domain/order/order';
import { TableSitting } from '../../domain/table/table-sitting';
import {
  billableOrders,
  tableAccountCanClose,
  tableAccountTotals,
} from '../../domain/totals/table-account';
import type { OrderTotals } from '../../domain/totals/order-totals';
import { NoOpenTableSittingError } from '../../domain/table/table-sitting';
import type { OrderRepository } from '../ports/order-repository';
import type { TableSittingRepository } from '../ports/table-sitting-repository';

export type TableAccountView = {
  sitting: TableSitting | null;
  orders: Order[];
  totals: OrderTotals | null;
  canClose: boolean;
};

export class GetTableAccount {
  constructor(
    private readonly orders: OrderRepository,
    private readonly sittings: TableSittingRepository,
  ) {}

  async execute(tableId: string): Promise<TableAccountView> {
    const sitting = await this.ensureSitting(tableId);
    if (sitting === null) {
      return { sitting: null, orders: [], totals: null, canClose: false };
    }

    const orders = billableOrders(await this.orders.listBySittingId(sitting.id));
    const combined = sitting.billingMode === 'combined';
    return {
      sitting,
      orders,
      totals: combined
        ? tableAccountTotals({
            orders,
            discount: sitting.discount,
            tip: sitting.tip,
          })
        : null,
      canClose: combined && tableAccountCanClose(orders),
    };
  }

  /** One open bill per table. Older comandas without a sitting are pulled into it. */
  private async ensureSitting(tableId: string): Promise<TableSitting | null> {
    const active = await this.orders.listActiveByTableId(tableId);
    let sitting = await this.sittings.findOpenByTableId(tableId);
    if (sitting === null) {
      if (active.length === 0) {
        return null;
      }
      sitting = TableSitting.open({ id: `sitting-${active[0].id}`, tableId });
      await this.sittings.add(sitting);
    }

    for (const order of active) {
      if (order.sittingId === null) {
        await this.orders.save(order.bindSitting(sitting.id));
      }
    }
    return sitting;
  }
}

export function requireOpenSitting(sitting: TableSitting | null): TableSitting {
  if (sitting === null) {
    throw new NoOpenTableSittingError();
  }
  return sitting;
}

import type { BillingMode } from '../../domain/table/table-sitting';
import type { OrderRepository } from '../ports/order-repository';
import type { TableSittingRepository } from '../ports/table-sitting-repository';
import { GetTableAccount, requireOpenSitting } from './get-table-account';
import { toDiscount, toTip, type AdjustmentCommand } from '../totals/adjustment-command';

export class SetTableBillingMode {
  constructor(
    private readonly orders: OrderRepository,
    private readonly sittings: TableSittingRepository,
  ) {}

  async execute(tableId: string, billingMode: BillingMode) {
    const sitting = requireOpenSitting(await this.sittings.findOpenByTableId(tableId));
    await this.sittings.save(sitting.setBillingMode(billingMode));
    return new GetTableAccount(this.orders, this.sittings).execute(tableId);
  }
}

export class SetTableDiscount {
  constructor(
    private readonly orders: OrderRepository,
    private readonly sittings: TableSittingRepository,
  ) {}

  async execute(tableId: string, discount: AdjustmentCommand | null) {
    const sitting = requireOpenSitting(await this.sittings.findOpenByTableId(tableId));
    await this.sittings.save(sitting.setDiscount(discount === null ? null : toDiscount(discount)));
    return new GetTableAccount(this.orders, this.sittings).execute(tableId);
  }
}

export class SetTableTip {
  constructor(
    private readonly orders: OrderRepository,
    private readonly sittings: TableSittingRepository,
  ) {}

  async execute(tableId: string, tip: AdjustmentCommand | null) {
    const sitting = requireOpenSitting(await this.sittings.findOpenByTableId(tableId));
    await this.sittings.save(sitting.setTip(tip === null ? null : toTip(tip)));
    return new GetTableAccount(this.orders, this.sittings).execute(tableId);
  }
}

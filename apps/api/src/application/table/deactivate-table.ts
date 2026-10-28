import { Table } from '../../domain/table/table';
import { OrderRepository } from '../ports/order-repository';
import { TableRepository } from '../ports/table-repository';
import { TableHasActiveOrderError, TableNotFoundError } from './table-repository.errors';

export class DeactivateTable {
  constructor(
    private readonly tables: TableRepository,
    private readonly orders: OrderRepository,
  ) {}

  async execute(id: string): Promise<Table> {
    const current = await this.tables.findById(id);
    if (current == null) {
      throw new TableNotFoundError();
    }

    const activeOrders = await this.orders.listActiveByTableId(id);
    if (activeOrders.length > 0) {
      throw new TableHasActiveOrderError();
    }

    if (!current.active) {
      return current;
    }

    const inactive = current.deactivate();
    await this.tables.save(inactive);
    return inactive;
  }
}

import { Table } from '../../domain/table/table';
import { ActiveOrdersQuery } from '../ports/active-orders-query';
import { TableRepository } from '../ports/table-repository';
import { TableHasActiveOrderError, TableNotFoundError } from './table-repository.errors';

export class DeactivateTable {
  constructor(
    private readonly tables: TableRepository,
    private readonly activeOrders: ActiveOrdersQuery,
  ) {}

  async execute(id: string): Promise<Table> {
    const current = await this.tables.findById(id);
    if (current == null) {
      throw new TableNotFoundError();
    }

    if (await this.activeOrders.hasActiveOrder(id)) {
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

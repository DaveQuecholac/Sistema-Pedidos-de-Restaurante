import { Table } from '../../domain/table/table';
import { TableRepository } from '../ports/table-repository';
import { TableNotFoundError } from './table-repository.errors';

export class ActivateTable {
  constructor(private readonly tables: TableRepository) {}

  async execute(id: string): Promise<Table> {
    const current = await this.tables.findById(id);
    if (current == null) {
      throw new TableNotFoundError();
    }

    if (current.active) {
      return current;
    }

    const active = current.activate();
    await this.tables.save(active);
    return active;
  }
}

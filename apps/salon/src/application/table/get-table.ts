import { Table } from '../../domain/table/table';
import { TableRepository } from '../ports/table-repository';
import { TableNotFoundError } from './table-repository.errors';

export class GetTable {
  constructor(private readonly tables: TableRepository) {}

  async execute(id: string): Promise<Table> {
    const table = await this.tables.findById(id);
    if (table == null) {
      throw new TableNotFoundError();
    }

    return table;
  }
}

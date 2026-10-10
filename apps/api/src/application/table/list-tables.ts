import { Table } from '../../domain/table/table';
import { TableRepository } from '../ports/table-repository';

export class ListTables {
  constructor(private readonly tables: TableRepository) {}

  async execute(): Promise<Table[]> {
    return this.tables.list();
  }
}

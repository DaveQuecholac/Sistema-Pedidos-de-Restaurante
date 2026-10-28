import { Table } from '../../domain/table/table';
import { TableRepository } from '../ports/table-repository';

export type CreateTableCommand = {
  id: string;
  label: string;
  zone?: string;
};

const DEFAULT_ZONE = 'Salón';

export class CreateTable {
  constructor(private readonly tables: TableRepository) {}

  async execute(command: CreateTableCommand): Promise<Table> {
    const table = Table.create({
      id: command.id,
      label: command.label,
      zone: command.zone ?? DEFAULT_ZONE,
    });

    await this.tables.add(table);
    return table;
  }
}

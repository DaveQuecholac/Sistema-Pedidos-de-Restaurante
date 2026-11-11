import { Table } from '../../domain/table/table';
import { TableRepository } from '../ports/table-repository';
import { TableNotFoundError } from './table-repository.errors';

export type UpdateTableCommand = {
  id: string;
  label: string;
  zone: string;
};

export class UpdateTable {
  constructor(private readonly tables: TableRepository) {}

  async execute(command: UpdateTableCommand): Promise<Table> {
    const current = await this.tables.findById(command.id);
    if (current == null) {
      throw new TableNotFoundError();
    }

    const updated = current.rename(command.label).setZone(command.zone);
    await this.tables.save(updated);
    return updated;
  }
}

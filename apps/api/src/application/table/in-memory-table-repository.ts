import { Table } from '../../domain/table/table';
import { TableRepository } from '../ports/table-repository';
import { TableAlreadyExistsError, TableNotFoundError } from './table-repository.errors';

/** Test double. Keeps first-add order and never hands out the stored object. */
export class InMemoryTableRepository implements TableRepository {
  private readonly tables = new Map<string, Table>();

  constructor(initial: readonly Table[] = []) {
    for (const table of initial) {
      this.tables.set(table.id, copy(table));
    }
  }

  async add(table: Table): Promise<void> {
    if (this.tables.has(table.id)) {
      throw new TableAlreadyExistsError();
    }

    this.tables.set(table.id, copy(table));
  }

  async save(table: Table): Promise<void> {
    if (!this.tables.has(table.id)) {
      throw new TableNotFoundError();
    }

    this.tables.set(table.id, copy(table));
  }

  async findById(id: string): Promise<Table | null> {
    const stored = this.tables.get(id);
    return stored === undefined ? null : copy(stored);
  }

  async list(): Promise<Table[]> {
    return [...this.tables.values()].map(copy);
  }
}

function copy(table: Table): Table {
  return Table.restore({
    id: table.id,
    label: table.label,
    zone: table.zone,
    active: table.active,
  });
}

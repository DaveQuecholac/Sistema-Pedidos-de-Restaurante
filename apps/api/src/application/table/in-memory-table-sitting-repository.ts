import { TableSitting } from '../../domain/table/table-sitting';
import type { TableSittingRepository } from '../ports/table-sitting-repository';

export class TableSittingAlreadyExistsError extends Error {
  constructor() {
    super('Table sitting already exists');
    this.name = 'TableSittingAlreadyExistsError';
  }
}

export class TableSittingNotFoundError extends Error {
  constructor() {
    super('Table sitting was not found');
    this.name = 'TableSittingNotFoundError';
  }
}

/** Test double. Never hands out the stored object. */
export class InMemoryTableSittingRepository implements TableSittingRepository {
  private readonly sittings = new Map<string, TableSitting>();

  async add(sitting: TableSitting): Promise<void> {
    if (this.sittings.has(sitting.id)) {
      throw new TableSittingAlreadyExistsError();
    }
    this.sittings.set(sitting.id, copy(sitting));
  }

  async save(sitting: TableSitting): Promise<void> {
    if (!this.sittings.has(sitting.id)) {
      throw new TableSittingNotFoundError();
    }
    this.sittings.set(sitting.id, copy(sitting));
  }

  async findById(id: string): Promise<TableSitting | null> {
    const stored = this.sittings.get(id);
    return stored === undefined ? null : copy(stored);
  }

  async findOpenByTableId(tableId: string): Promise<TableSitting | null> {
    for (const sitting of this.sittings.values()) {
      if (sitting.tableId === tableId && sitting.status === 'OPEN') {
        return copy(sitting);
      }
    }
    return null;
  }
}

function copy(sitting: TableSitting): TableSitting {
  return TableSitting.restore({
    id: sitting.id,
    tableId: sitting.tableId,
    status: sitting.status,
    billingMode: sitting.billingMode,
    discount: sitting.discount,
    tip: sitting.tip,
    payment: sitting.payment,
  });
}

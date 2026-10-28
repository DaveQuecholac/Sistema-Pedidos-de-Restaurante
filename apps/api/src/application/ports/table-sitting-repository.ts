import type { TableSitting } from '../../domain/table/table-sitting';

/** Driven port for the open bill shared by a table's comandas. */
export interface TableSittingRepository {
  add(sitting: TableSitting): Promise<void>;
  save(sitting: TableSitting): Promise<void>;
  findById(id: string): Promise<TableSitting | null>;
  findOpenByTableId(tableId: string): Promise<TableSitting | null>;
}

import type { Table } from '../../domain/table/table';

/** Driven port for the dining-table catalog. No SQL and no HTTP. */
export interface TableRepository {
  add(table: Table): Promise<void>;
  save(table: Table): Promise<void>;
  findById(id: string): Promise<Table | null>;
  list(): Promise<Table[]>;
}

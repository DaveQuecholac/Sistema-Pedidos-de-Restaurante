import { asc, eq, type ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { TableRepository } from '../../../application/ports/table-repository';
import {
  TableAlreadyExistsError,
  TableNotFoundError,
} from '../../../application/table/table-repository.errors';
import type { Table } from '../../../domain/table/table';
import type { AppDatabase } from './client';
import { toTable, toTableRow } from './table.mapper';
import * as schema from './schema/menu';
import { tables } from './schema/table';

type MenuSchema = typeof schema;

/** Root client from `createDatabase`, or the `tx` passed to a Drizzle transaction callback. */
export type TableDatabase =
  | AppDatabase
  | PgTransaction<PostgresJsQueryResultHKT, MenuSchema, ExtractTablesWithRelations<MenuSchema>>;

export class DrizzleTableRepository implements TableRepository {
  constructor(private readonly db: TableDatabase) {}

  async add(table: Table): Promise<void> {
    try {
      await this.db.insert(tables).values(toTableRow(table));
    } catch (error) {
      if (isTablePrimaryKeyViolation(error)) {
        throw new TableAlreadyExistsError();
      }
      throw error;
    }
  }

  async save(table: Table): Promise<void> {
    const updated = await this.db
      .update(tables)
      .set(toTableRow(table))
      .where(eq(tables.id, table.id))
      .returning({ id: tables.id });

    if (updated.length === 0) {
      throw new TableNotFoundError();
    }
  }

  async findById(id: string): Promise<Table | null> {
    const rows = await this.db.select().from(tables).where(eq(tables.id, id));
    const stored = rows[0];
    return stored === undefined ? null : toTable(stored);
  }

  async list(): Promise<Table[]> {
    const rows = await this.db.select().from(tables).orderBy(asc(tables.id));
    return rows.map(toTable);
  }
}

function isTablePrimaryKeyViolation(error: unknown): boolean {
  if (error instanceof postgres.PostgresError) {
    return error.code === '23505' && error.constraint_name === 'tables_pkey';
  }

  if (typeof error === 'object' && error !== null && 'cause' in error) {
    return isTablePrimaryKeyViolation(error.cause);
  }

  return false;
}

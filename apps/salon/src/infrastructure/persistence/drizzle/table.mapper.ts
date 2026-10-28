import type { InferSelectModel } from 'drizzle-orm';
import { TableMappingError } from '../../../application/table/table-repository.errors';
import { Table } from '../../../domain/table/table';
import {
  InvalidTableIdError,
  InvalidTableLabelError,
  InvalidTableZoneError,
} from '../../../domain/table/table.errors';
import { tables } from './schema/table';

export type TableRow = InferSelectModel<typeof tables>;

export function toTable(row: TableRow): Table {
  try {
    return Table.restore({
      id: row.id,
      label: row.label,
      zone: row.zone,
      active: row.active,
    });
  } catch (error) {
    if (
      error instanceof InvalidTableIdError ||
      error instanceof InvalidTableLabelError ||
      error instanceof InvalidTableZoneError
    ) {
      throw new TableMappingError();
    }
    throw error;
  }
}

export function toTableRow(table: Table): TableRow {
  return {
    id: table.id,
    label: table.label,
    zone: table.zone,
    active: table.active,
  };
}

import { Table } from '../../../domain/table/table';

export function presentTable(table: Table) {
  return {
    id: table.id,
    label: table.label,
    zone: table.zone,
    active: table.active,
  };
}

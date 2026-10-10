import { Table } from '../../domain/table/table';
import { InMemoryTableRepository } from './in-memory-table-repository';

/** Active Salón tables for tests / temporary Nest wiring until Drizzle catalog. */
export function salonTables(...ids: string[]): InMemoryTableRepository {
  return new InMemoryTableRepository(
    ids.map((id) => Table.create({ id, label: id, zone: 'Salón' })),
  );
}

/** Covers current demo floor + HTTP fixtures that open tables 1–10. */
export const DEMO_SALON_TABLE_IDS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
] as const;

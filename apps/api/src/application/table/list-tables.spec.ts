import { describe, expect, it } from 'vitest';
import { Table } from '../../domain/table/table';
import { InMemoryTableRepository } from './in-memory-table-repository';
import { ListTables } from './list-tables';

describe('ListTables', () => {
  it('returns an empty list when there are no tables (A15)', async () => {
    const listed = await new ListTables(new InMemoryTableRepository()).execute();

    expect(listed).toEqual([]);
  });

  it('returns active and inactive tables in first-add order (A16)', async () => {
    const tables = new InMemoryTableRepository();
    await tables.add(Table.create({ id: '1', label: '1', zone: 'Salón' }));
    await tables.add(
      Table.restore({ id: '2', label: '2', zone: 'Terraza', active: false }),
    );

    const listed = await new ListTables(tables).execute();

    expect(listed.map((table) => table.id)).toEqual(['1', '2']);
    expect(listed[0]?.active).toBe(true);
    expect(listed[1]?.active).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { Table } from '../../domain/table/table';
import { TableRepository } from '../ports/table-repository';
import { ActivateTable } from './activate-table';
import { InMemoryTableRepository } from './in-memory-table-repository';
import { TableNotFoundError } from './table-repository.errors';

function watch(tables: TableRepository) {
  const calls = { save: 0 };
  const wrapped: TableRepository = {
    add: (table) => tables.add(table),
    async save(table) {
      calls.save += 1;
      await tables.save(table);
    },
    findById: (id) => tables.findById(id),
    list: () => tables.list(),
  };
  return { tables: wrapped, calls };
}

describe('ActivateTable', () => {
  it('rejects a missing id and does not call save (A12)', async () => {
    const seen = watch(new InMemoryTableRepository());

    await expect(new ActivateTable(seen.tables).execute('missing')).rejects.toBeInstanceOf(
      TableNotFoundError,
    );
    expect(seen.calls.save).toBe(0);
  });

  it('activates an inactive table (A13)', async () => {
    const tables = new InMemoryTableRepository();
    await tables.add(
      Table.restore({ id: '1', label: '1', zone: 'Salón', active: false }),
    );
    const seen = watch(tables);

    const active = await new ActivateTable(seen.tables).execute('1');

    expect(seen.calls.save).toBe(1);
    expect(active.active).toBe(true);
  });

  it('does not save again when already active (A14)', async () => {
    const tables = new InMemoryTableRepository();
    await tables.add(Table.create({ id: '1', label: '1', zone: 'Salón' }));
    const seen = watch(tables);

    const result = await new ActivateTable(seen.tables).execute('1');

    expect(result.active).toBe(true);
    expect(seen.calls.save).toBe(0);
  });
});

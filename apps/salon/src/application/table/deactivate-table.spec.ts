import { describe, expect, it } from 'vitest';
import { Table } from '../../domain/table/table';
import { ActiveOrdersQuery } from '../ports/active-orders-query';
import { TableRepository } from '../ports/table-repository';
import { DeactivateTable } from './deactivate-table';
import { InMemoryTableRepository } from './in-memory-table-repository';
import {
  ActiveOrdersUnavailableError,
  TableHasActiveOrderError,
  TableNotFoundError,
} from './table-repository.errors';

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

function query(active: boolean): ActiveOrdersQuery {
  return {
    hasActiveOrder: async () => active,
  };
}

describe('DeactivateTable', () => {
  it('rejects a missing id and does not call save (A8)', async () => {
    const seen = watch(new InMemoryTableRepository());

    await expect(
      new DeactivateTable(seen.tables, query(false)).execute('missing'),
    ).rejects.toBeInstanceOf(TableNotFoundError);
    expect(seen.calls.save).toBe(0);
  });

  it('deactivates an active table when the query is false (A9)', async () => {
    const tables = new InMemoryTableRepository();
    await tables.add(Table.create({ id: '1', label: '1', zone: 'Salón' }));
    const seen = watch(tables);

    const inactive = await new DeactivateTable(seen.tables, query(false)).execute('1');

    expect(seen.calls.save).toBe(1);
    expect(inactive.active).toBe(false);
    expect(inactive.id).toBe('1');
  });

  it('does not save again when already inactive (A10)', async () => {
    const tables = new InMemoryTableRepository();
    await tables.add(Table.restore({ id: '1', label: '1', zone: 'Salón', active: false }));
    const seen = watch(tables);

    const result = await new DeactivateTable(seen.tables, query(false)).execute('1');

    expect(result.active).toBe(false);
    expect(seen.calls.save).toBe(0);
  });

  it('keeps a deactivated table in the list (A11)', async () => {
    const tables = new InMemoryTableRepository();
    await tables.add(Table.create({ id: '1', label: '1', zone: 'Salón' }));

    await new DeactivateTable(tables, query(false)).execute('1');

    const listed = await tables.list();
    expect(listed.map((table) => table.id)).toEqual(['1']);
    expect(listed[0]?.active).toBe(false);
  });

  it('rejects deactivate when the query reports an active order (A19)', async () => {
    const tables = new InMemoryTableRepository();
    await tables.add(Table.create({ id: '1', label: '1', zone: 'Salón' }));
    const seen = watch(tables);

    await expect(new DeactivateTable(seen.tables, query(true)).execute('1')).rejects.toBeInstanceOf(
      TableHasActiveOrderError,
    );
    expect(seen.calls.save).toBe(0);
    expect((await tables.findById('1'))?.active).toBe(true);
  });

  it('does not save when the query is down', async () => {
    const tables = new InMemoryTableRepository();
    await tables.add(Table.create({ id: '1', label: '1', zone: 'Salón' }));
    const seen = watch(tables);
    const down: ActiveOrdersQuery = {
      hasActiveOrder: async () => {
        throw new ActiveOrdersUnavailableError();
      },
    };

    await expect(new DeactivateTable(seen.tables, down).execute('1')).rejects.toBeInstanceOf(
      ActiveOrdersUnavailableError,
    );
    expect(seen.calls.save).toBe(0);
    expect((await tables.findById('1'))?.active).toBe(true);
  });
});

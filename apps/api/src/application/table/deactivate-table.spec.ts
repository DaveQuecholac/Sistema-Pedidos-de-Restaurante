import { describe, expect, it } from 'vitest';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import { Table } from '../../domain/table/table';
import { InMemoryOrderRepository } from '../order/in-memory-order-repository';
import { TableRepository } from '../ports/table-repository';
import { DeactivateTable } from './deactivate-table';
import { InMemoryTableRepository } from './in-memory-table-repository';
import { TableHasActiveOrderError, TableNotFoundError } from './table-repository.errors';

const OPENED_AT = new Date('2026-10-04T18:00:00.000Z');

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

describe('DeactivateTable', () => {
  it('rejects a missing id and does not call save (A8)', async () => {
    const seen = watch(new InMemoryTableRepository());
    const orders = new InMemoryOrderRepository();

    await expect(
      new DeactivateTable(seen.tables, orders).execute('missing'),
    ).rejects.toBeInstanceOf(TableNotFoundError);
    expect(seen.calls.save).toBe(0);
  });

  it('deactivates an active table with no order (A9)', async () => {
    const tables = new InMemoryTableRepository();
    await tables.add(Table.create({ id: '1', label: '1', zone: 'Salón' }));
    const seen = watch(tables);

    const inactive = await new DeactivateTable(
      seen.tables,
      new InMemoryOrderRepository(),
    ).execute('1');

    expect(seen.calls.save).toBe(1);
    expect(inactive.active).toBe(false);
    expect(inactive.id).toBe('1');
  });

  it('does not save again when already inactive (A10)', async () => {
    const tables = new InMemoryTableRepository();
    await tables.add(
      Table.restore({ id: '1', label: '1', zone: 'Salón', active: false }),
    );
    const seen = watch(tables);

    const result = await new DeactivateTable(
      seen.tables,
      new InMemoryOrderRepository(),
    ).execute('1');

    expect(result.active).toBe(false);
    expect(seen.calls.save).toBe(0);
  });

  it('keeps a deactivated table in the list (A11)', async () => {
    const tables = new InMemoryTableRepository();
    await tables.add(Table.create({ id: '1', label: '1', zone: 'Salón' }));

    await new DeactivateTable(tables, new InMemoryOrderRepository()).execute('1');

    const listed = await tables.list();
    expect(listed.map((table) => table.id)).toEqual(['1']);
    expect(listed[0]?.active).toBe(false);
  });

  it('rejects deactivate when the table has an active order (A19)', async () => {
    const tables = new InMemoryTableRepository();
    await tables.add(Table.create({ id: '1', label: '1', zone: 'Salón' }));
    const orders = new InMemoryOrderRepository();
    await orders.add(
      Order.open({ id: 'order-1', origin: OrderOrigin.table('1'), openedAt: OPENED_AT }),
    );
    const seen = watch(tables);

    await expect(
      new DeactivateTable(seen.tables, orders).execute('1'),
    ).rejects.toBeInstanceOf(TableHasActiveOrderError);
    expect(seen.calls.save).toBe(0);

    const stored = await tables.findById('1');
    expect(stored?.active).toBe(true);
  });

  it('allows deactivate when the only order on the table is CANCELLED (A20)', async () => {
    const tables = new InMemoryTableRepository();
    await tables.add(Table.create({ id: '1', label: '1', zone: 'Salón' }));
    const orders = new InMemoryOrderRepository();
    await orders.add(
      Order.restore({
        id: 'order-cancelled',
        origin: OrderOrigin.table('1'),
        status: 'CANCELLED',
        openedAt: OPENED_AT,
        lines: [],
        version: 1,
        discount: null,
        tip: null,
        payment: null,
      }),
    );
    const seen = watch(tables);

    const inactive = await new DeactivateTable(seen.tables, orders).execute('1');

    expect(inactive.active).toBe(false);
    expect(seen.calls.save).toBe(1);
  });
});

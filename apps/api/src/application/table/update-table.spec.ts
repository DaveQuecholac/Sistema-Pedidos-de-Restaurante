import { describe, expect, it } from 'vitest';
import { Table } from '../../domain/table/table';
import {
  InvalidTableLabelError,
  InvalidTableZoneError,
} from '../../domain/table/table.errors';
import { TableRepository } from '../ports/table-repository';
import { InMemoryTableRepository } from './in-memory-table-repository';
import { TableNotFoundError } from './table-repository.errors';
import { UpdateTable } from './update-table';

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

describe('UpdateTable', () => {
  it('updates label and zone (A5)', async () => {
    const tables = new InMemoryTableRepository();
    await tables.add(Table.create({ id: '1', label: '1', zone: 'Salón' }));
    const seen = watch(tables);

    const updated = await new UpdateTable(seen.tables).execute({
      id: '1',
      label: 'Ventana',
      zone: 'Terraza',
    });

    expect(seen.calls.save).toBe(1);
    expect(updated.label).toBe('Ventana');
    expect(updated.zone).toBe('Terraza');
    expect(updated.active).toBe(true);
  });

  it('rejects a missing id and does not call save (A6)', async () => {
    const seen = watch(new InMemoryTableRepository());

    await expect(
      new UpdateTable(seen.tables).execute({ id: 'missing', label: 'X', zone: 'Salón' }),
    ).rejects.toBeInstanceOf(TableNotFoundError);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects blank label or zone and does not save (A7)', async () => {
    const tables = new InMemoryTableRepository();
    await tables.add(Table.create({ id: '1', label: '1', zone: 'Salón' }));

    await expect(
      new UpdateTable(tables).execute({ id: '1', label: '   ', zone: 'Salón' }),
    ).rejects.toBeInstanceOf(InvalidTableLabelError);

    await expect(
      new UpdateTable(tables).execute({ id: '1', label: '1', zone: '   ' }),
    ).rejects.toBeInstanceOf(InvalidTableZoneError);

    const stored = await tables.findById('1');
    expect(stored?.label).toBe('1');
    expect(stored?.zone).toBe('Salón');
  });
});

import { describe, expect, it } from 'vitest';
import { Table } from '../../domain/table/table';
import { InMemoryTableRepository } from './in-memory-table-repository';
import { TableAlreadyExistsError, TableNotFoundError } from './table-repository.errors';

function mesa(overrides: Partial<Parameters<typeof Table.create>[0]> = {}): Table {
  return Table.create({
    id: '1',
    label: '1',
    zone: 'Salón',
    ...overrides,
  });
}

describe('InMemoryTableRepository', () => {
  it('stores a table and finds an equivalent copy (TP1)', async () => {
    const repo = new InMemoryTableRepository();
    const table = mesa();

    await repo.add(table);
    const found = await repo.findById('1');

    expect(found).not.toBeNull();
    expect(found).not.toBe(table);
    expect(found?.id).toBe('1');
    expect(found?.label).toBe('1');
    expect(found?.zone).toBe('Salón');
    expect(found?.active).toBe(true);
  });

  it('returns null when the id is missing (TP2)', async () => {
    const repo = new InMemoryTableRepository();

    await expect(repo.findById('missing')).resolves.toBeNull();
  });

  it('rejects add with a duplicate id (TP3)', async () => {
    const repo = new InMemoryTableRepository();
    await repo.add(mesa());

    await expect(repo.add(mesa())).rejects.toBeInstanceOf(TableAlreadyExistsError);
  });

  it('rejects save when the table does not exist (TP4)', async () => {
    const repo = new InMemoryTableRepository();

    await expect(repo.save(mesa())).rejects.toBeInstanceOf(TableNotFoundError);
  });

  it('saves updates and returns a copy on find (TP5)', async () => {
    const repo = new InMemoryTableRepository();
    await repo.add(mesa());

    await repo.save(mesa().rename('Ventana').setZone('Terraza').deactivate());
    const found = await repo.findById('1');

    expect(found?.label).toBe('Ventana');
    expect(found?.zone).toBe('Terraza');
    expect(found?.active).toBe(false);
  });

  it('lists in first-add order and never exposes stored objects (TP6)', async () => {
    const repo = new InMemoryTableRepository();
    await repo.add(mesa({ id: '1', label: '1' }));
    await repo.add(mesa({ id: '2', label: '2' }));

    const listed = await repo.list();
    listed[0]?.deactivate();

    expect(listed.map((table) => table.id)).toEqual(['1', '2']);
    const again = await repo.list();
    expect(again[0]?.active).toBe(true);
    expect(again[0]).not.toBe(listed[0]);
  });
});

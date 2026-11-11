import { describe, expect, it } from 'vitest';
import { Table } from '../../domain/table/table';
import { GetTable } from './get-table';
import { InMemoryTableRepository } from './in-memory-table-repository';
import { TableNotFoundError } from './table-repository.errors';

describe('GetTable', () => {
  it('returns the table when it exists (A17)', async () => {
    const tables = new InMemoryTableRepository();
    await tables.add(Table.create({ id: '3', label: 'Mesa 3', zone: 'Salón' }));

    const found = await new GetTable(tables).execute('3');

    expect(found.id).toBe('3');
    expect(found.label).toBe('Mesa 3');
  });

  it('rejects a missing id (A18)', async () => {
    await expect(new GetTable(new InMemoryTableRepository()).execute('missing')).rejects.toBeInstanceOf(
      TableNotFoundError,
    );
  });
});

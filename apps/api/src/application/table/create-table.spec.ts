import { describe, expect, it } from 'vitest';
import {
  InvalidTableIdError,
  InvalidTableLabelError,
  InvalidTableZoneError,
} from '../../domain/table/table.errors';
import { TableRepository } from '../ports/table-repository';
import { CreateTable, CreateTableCommand } from './create-table';
import { InMemoryTableRepository } from './in-memory-table-repository';
import { TableAlreadyExistsError } from './table-repository.errors';

function watch(tables: TableRepository) {
  const calls = { add: 0 };
  const wrapped: TableRepository = {
    async add(table) {
      calls.add += 1;
      await tables.add(table);
    },
    save: (table) => tables.save(table),
    findById: (id) => tables.findById(id),
    list: () => tables.list(),
  };
  return { tables: wrapped, calls };
}

function command(overrides: Partial<CreateTableCommand> = {}): CreateTableCommand {
  return {
    id: '7',
    label: '7',
    ...overrides,
  };
}

describe('CreateTable', () => {
  it('stores an active table with default zone Salón (A1)', async () => {
    const seen = watch(new InMemoryTableRepository());
    const created = await new CreateTable(seen.tables).execute(command());

    expect(seen.calls.add).toBe(1);
    expect(created.id).toBe('7');
    expect(created.label).toBe('7');
    expect(created.zone).toBe('Salón');
    expect(created.active).toBe(true);
  });

  it('uses the given zone when provided (A2)', async () => {
    const tables = new InMemoryTableRepository();
    const created = await new CreateTable(tables).execute(command({ zone: 'Terraza' }));

    expect(created.zone).toBe('Terraza');
  });

  it('rejects duplicate id and does not leave a second row (A3)', async () => {
    const tables = new InMemoryTableRepository();
    const useCase = new CreateTable(tables);
    await useCase.execute(command());

    await expect(useCase.execute(command())).rejects.toBeInstanceOf(TableAlreadyExistsError);
    expect(await tables.list()).toHaveLength(1);
  });

  it('rejects invalid commands and does not call add (A4)', async () => {
    const cases: Array<{ command: CreateTableCommand; error: new () => Error }> = [
      { command: command({ id: '   ' }), error: InvalidTableIdError },
      { command: command({ id: 'a'.repeat(41) }), error: InvalidTableIdError },
      { command: command({ label: '   ' }), error: InvalidTableLabelError },
      { command: command({ zone: '   ' }), error: InvalidTableZoneError },
    ];

    for (const entry of cases) {
      const seen = watch(new InMemoryTableRepository());
      await expect(new CreateTable(seen.tables).execute(entry.command)).rejects.toBeInstanceOf(
        entry.error,
      );
      expect(seen.calls.add).toBe(0);
    }
  });
});

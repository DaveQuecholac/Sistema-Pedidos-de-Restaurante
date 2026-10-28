import type { Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  TableAlreadyExistsError,
  TableNotFoundError,
} from '../../../application/table/table-repository.errors';
import { Table } from '../../../domain/table/table';
import { type AppDatabase, createDatabase } from './client';
import { DrizzleTableRepository, type TableDatabase } from './drizzle-table-repository';

const integrationOn = process.env.TABLE_REPOSITORY_INTEGRATION === '1';

if (integrationOn && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const describeIntegration = integrationOn ? describe : describe.skip;

describeIntegration('DrizzleTableRepository', () => {
  let client: Sql;
  let db: AppDatabase;

  beforeAll(() => {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is required');
    }

    const opened = createDatabase(url);
    client = opened.client;
    db = opened.db;
  });

  afterAll(async () => {
    await client.end();
  });

  it('stores a table and finds label, zone and active (T1)', async () => {
    const tableId = id();

    await inTransaction(db, async (repo) => {
      await repo.add(
        Table.create({ id: tableId, label: `Mesa ${tableId}`, zone: 'Salón' }),
      );

      const found = await repo.findById(tableId);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(tableId);
      expect(found?.label).toBe(`Mesa ${tableId}`);
      expect(found?.zone).toBe('Salón');
      expect(found?.active).toBe(true);
    });
  });

  it('stays visible to another repository on the same transaction and disappears after rollback (T2)', async () => {
    const tableId = id();

    await inTransaction(db, async (repo, tx) => {
      await repo.add(Table.create({ id: tableId, label: tableId, zone: 'Salón' }));

      const other = new DrizzleTableRepository(tx);
      expect((await other.findById(tableId))?.id).toBe(tableId);
    });

    const outside = new DrizzleTableRepository(db);
    expect(await outside.findById(tableId)).toBeNull();
  });

  it('rejects add with a duplicate id (T3)', async () => {
    const tableId = id();

    await inTransaction(db, async (repo) => {
      await repo.add(Table.create({ id: tableId, label: tableId, zone: 'Salón' }));

      await expect(
        repo.add(Table.create({ id: tableId, label: 'otra', zone: 'Terraza' })),
      ).rejects.toBeInstanceOf(TableAlreadyExistsError);
    });
  });

  it('rejects save of a missing id (T4)', async () => {
    await inTransaction(db, async (repo) => {
      await expect(
        repo.save(Table.create({ id: id(), label: 'x', zone: 'Salón' })),
      ).rejects.toBeInstanceOf(TableNotFoundError);
    });
  });

  it('saves label, zone and deactivate (T5)', async () => {
    const tableId = id();

    await inTransaction(db, async (repo) => {
      await repo.add(Table.create({ id: tableId, label: tableId, zone: 'Salón' }));
      await repo.save(
        Table.create({ id: tableId, label: 'Ventana', zone: 'Terraza' }).deactivate(),
      );

      const found = await repo.findById(tableId);
      expect(found?.label).toBe('Ventana');
      expect(found?.zone).toBe('Terraza');
      expect(found?.active).toBe(false);
    });
  });

  it('lists in id order including inactive (T6)', async () => {
    const first = `a-${id()}`;
    const second = `b-${id()}`;

    await inTransaction(db, async (repo) => {
      await repo.add(Table.create({ id: second, label: second, zone: 'Salón' }));
      await repo.add(
        Table.restore({ id: first, label: first, zone: 'Patio', active: false }),
      );

      const listed = await repo.list();
      const ours = listed.filter((table) => table.id === first || table.id === second);

      expect(ours.map((table) => table.id)).toEqual([first, second]);
      expect(ours[0]?.active).toBe(false);
      expect(ours[1]?.active).toBe(true);
    });
  });
});

class RollbackSignal extends Error {
  constructor() {
    super('rollback');
    this.name = 'RollbackSignal';
  }
}

async function inTransaction(
  db: AppDatabase,
  run: (repo: DrizzleTableRepository, tx: TableDatabase) => Promise<void>,
): Promise<void> {
  let failure: unknown;

  try {
    await db.transaction(async (tx) => {
      const repo = new DrizzleTableRepository(tx);
      try {
        await run(repo, tx);
      } catch (error) {
        failure = error;
      }
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      throw error;
    }
  }

  if (failure) {
    throw failure;
  }
}

function id(): string {
  return crypto.randomUUID().slice(0, 40);
}

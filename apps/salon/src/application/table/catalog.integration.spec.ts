import type { Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ActiveOrdersQuery } from '../ports/active-orders-query';
import { ActivateTable } from './activate-table';
import { CreateTable } from './create-table';
import { DeactivateTable } from './deactivate-table';
import { ListTables } from './list-tables';
import {
  ActiveOrdersUnavailableError,
  TableHasActiveOrderError,
} from './table-repository.errors';
import { UpdateTable } from './update-table';
import { type AppDatabase, createDatabase } from '../../infrastructure/persistence/drizzle/client';
import {
  DrizzleTableRepository,
  type TableDatabase,
} from '../../infrastructure/persistence/drizzle/drizzle-table-repository';

const integrationOn = process.env.SALON_REPOSITORY_INTEGRATION === '1';

if (integrationOn && !process.env.SALON_DATABASE_URL) {
  throw new Error('SALON_DATABASE_URL is required');
}

const describeIntegration = integrationOn ? describe : describe.skip;

function query(active: boolean): ActiveOrdersQuery {
  return { hasActiveOrder: async () => active };
}

describeIntegration('salon catalog use cases', () => {
  let client: Sql;
  let db: AppDatabase;

  beforeAll(() => {
    const url = process.env.SALON_DATABASE_URL;
    if (!url) {
      throw new Error('SALON_DATABASE_URL is required');
    }

    const opened = createDatabase(url);
    client = opened.client;
    db = opened.db;
  });

  afterAll(async () => {
    await client.end();
  });

  it('creates, lists, changes zone, activates, and deactivates when the query is false (S4-1)', async () => {
    const tableId = id();

    await inTransaction(db, async (tx) => {
      const tables = new DrizzleTableRepository(tx);
      const created = await new CreateTable(tables).execute({
        id: tableId,
        label: 'Ventana',
        zone: 'Salón',
      });
      expect(created.active).toBe(true);

      const listed = await new ListTables(tables).execute();
      expect(listed.find((table) => table.id === tableId)?.zone).toBe('Salón');

      const moved = await new UpdateTable(tables).execute({
        id: tableId,
        label: 'Ventana',
        zone: 'Terraza',
      });
      expect(moved.zone).toBe('Terraza');

      const inactive = await new DeactivateTable(tables, query(false)).execute(tableId);
      expect(inactive.active).toBe(false);

      const active = await new ActivateTable(tables).execute(tableId);
      expect(active.active).toBe(true);
      expect((await tables.findById(tableId))?.active).toBe(true);
    });
  });

  it('refuses deactivate and keeps the table active when the query is true (S4-2)', async () => {
    const tableId = id();

    await inTransaction(db, async (tx) => {
      const tables = new DrizzleTableRepository(tx);
      await new CreateTable(tables).execute({ id: tableId, label: 'Mesa', zone: 'Salón' });

      await expect(new DeactivateTable(tables, query(true)).execute(tableId)).rejects.toBeInstanceOf(
        TableHasActiveOrderError,
      );
      expect((await tables.findById(tableId))?.active).toBe(true);
    });
  });

  it('does not save the baja when the query is down (S4-3)', async () => {
    const tableId = id();
    const down: ActiveOrdersQuery = {
      hasActiveOrder: async () => {
        throw new ActiveOrdersUnavailableError();
      },
    };

    await inTransaction(db, async (tx) => {
      const tables = new DrizzleTableRepository(tx);
      await new CreateTable(tables).execute({ id: tableId, label: 'Mesa', zone: 'Salón' });

      await expect(new DeactivateTable(tables, down).execute(tableId)).rejects.toBeInstanceOf(
        ActiveOrdersUnavailableError,
      );
      expect((await tables.findById(tableId))?.active).toBe(true);
    });
  });
});

class RollbackSignal extends Error {
  constructor() {
    super('rollback');
    this.name = 'RollbackSignal';
  }
}

async function inTransaction(db: AppDatabase, run: (tx: TableDatabase) => Promise<void>): Promise<void> {
  let failure: unknown;

  try {
    await db.transaction(async (tx) => {
      try {
        await run(tx);
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
  return `s4-${crypto.randomUUID().slice(0, 8)}`;
}

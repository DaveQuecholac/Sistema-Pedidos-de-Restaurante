import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AppDatabase, createDatabase } from './client';

const integrationOn = process.env.SALON_REPOSITORY_INTEGRATION === '1';

if (integrationOn && !process.env.SALON_DATABASE_URL) {
  throw new Error('SALON_DATABASE_URL is required');
}

const describeIntegration = integrationOn ? describe : describe.skip;

describeIntegration('salon table checks (S4-4)', () => {
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

  it('rejects an empty id, label and zone (S4-4)', async () => {
    await expect(insert('', 'Mesa', 'Salón')).rejects.toSatisfy((error: unknown) =>
      isCheckViolation(error, 'tables_id_len'),
    );
    await expect(insert('mesa-vacia', '', 'Salón')).rejects.toSatisfy((error: unknown) =>
      isCheckViolation(error, 'tables_label_not_blank'),
    );
    await expect(insert('mesa-zona', 'Mesa', '')).rejects.toSatisfy((error: unknown) =>
      isCheckViolation(error, 'tables_zone_not_blank'),
    );
  });

  async function insert(id: string, label: string, zone: string): Promise<void> {
    await db.execute(sql`insert into tables (id, label, zone) values (${id}, ${label}, ${zone})`);
  }
});

function isCheckViolation(error: unknown, constraint: string): boolean {
  if (error instanceof postgres.PostgresError) {
    return error.code === '23514' && error.constraint_name === constraint;
  }

  if (typeof error === 'object' && error !== null && 'cause' in error) {
    return isCheckViolation(error.cause, constraint);
  }

  return false;
}

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/payment';

export type PaymentsDatabase = PostgresJsDatabase<typeof schema>;

/** Opens Postgres from a URL the caller already resolved. Does not read the environment. */
export function createPaymentsDatabase(url: string): { client: postgres.Sql; db: PaymentsDatabase } {
  const client = postgres(url);
  const db = drizzle(client, { schema });
  return { client, db };
}

export async function assertDatabaseReachable(client: postgres.Sql): Promise<void> {
  await client`select 1`;
}

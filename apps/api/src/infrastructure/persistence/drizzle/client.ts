import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/menu';

export type AppDatabase = PostgresJsDatabase<typeof schema>;

/** Opens Postgres from a URL the caller already resolved. Does not read the environment. */
export function createDatabase(url: string): { client: postgres.Sql; db: AppDatabase } {
  const client = postgres(url);
  const db = drizzle(client, { schema });
  return { client, db };
}

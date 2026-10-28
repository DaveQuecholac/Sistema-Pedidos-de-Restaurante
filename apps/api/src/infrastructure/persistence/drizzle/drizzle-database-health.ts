import { sql } from 'drizzle-orm';
import { DatabaseHealthPort } from '../../../application/ports/database-health.port';
import { AppDatabase } from './client';

/** Driven adapter: asks Postgres `select 1` through the Drizzle client. */
export class DrizzleDatabaseHealth implements DatabaseHealthPort {
  constructor(private readonly db: AppDatabase) {}

  async ping(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }
}

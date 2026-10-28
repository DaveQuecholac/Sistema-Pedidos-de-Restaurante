import { DatabaseHealthPort } from '../ports/database-health.port';
import { DatabaseConnectionError } from './database-connection.error';

export type DatabaseConnectionStatus = {
  status: 'ok';
};

export class CheckDatabaseConnection {
  constructor(private readonly database: DatabaseHealthPort) {}

  async execute(): Promise<DatabaseConnectionStatus> {
    try {
      await this.database.ping();
    } catch {
      throw new DatabaseConnectionError();
    }

    return { status: 'ok' };
  }
}

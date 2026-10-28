import { describe, expect, it } from 'vitest';
import { DatabaseHealthPort } from '../ports/database-health.port';
import { CheckDatabaseConnection } from './check-database-connection';
import { DatabaseConnectionError } from './database-connection.error';

describe('CheckDatabaseConnection', () => {
  it('returns ok when ping resolves (U1)', async () => {
    const database: DatabaseHealthPort = {
      ping: async () => undefined,
    };

    const result = await new CheckDatabaseConnection(database).execute();

    expect(result).toEqual({ status: 'ok' });
  });

  it('throws DatabaseConnectionError when ping rejects (U2)', async () => {
    const database: DatabaseHealthPort = {
      ping: async () => {
        throw new Error('driver detail that the use case must not surface');
      },
    };

    await expect(new CheckDatabaseConnection(database).execute()).rejects.toBeInstanceOf(
      DatabaseConnectionError,
    );
  });
});

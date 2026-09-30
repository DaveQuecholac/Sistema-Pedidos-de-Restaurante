import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { CheckDatabaseConnection } from '../../../application/database/check-database-connection';
import { DatabaseHealthPort } from '../../../application/ports/database-health.port';
import { DatabaseHealthController } from './database-health.controller';

function testModule(port: DatabaseHealthPort) {
  @Module({
    controllers: [DatabaseHealthController],
    providers: [
      {
        provide: CheckDatabaseConnection,
        useValue: new CheckDatabaseConnection(port),
      },
    ],
  })
  class DatabaseHealthHttpModule {}

  return DatabaseHealthHttpModule;
}

describe('GET /health/database', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function listen(port: DatabaseHealthPort): Promise<number> {
    app = await NestFactory.create(testModule(port), { logger: false });
    await app.listen(0);
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('HTTP server did not bind a port');
    }
    return address.port;
  }

  it('returns ok when the database port answers', async () => {
    const assigned = await listen({ ping: async () => undefined });
    const response = await fetch(`http://127.0.0.1:${assigned}/health/database`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', service: 'restaurante-api' });
  });

  it('returns 503 without the driver message when the database port fails', async () => {
    const driverMessage = 'ECONNREFUSED secret driver detail';
    const assigned = await listen({
      ping: async () => {
        throw new Error(driverMessage);
      },
    });
    const response = await fetch(`http://127.0.0.1:${assigned}/health/database`);
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toEqual({ status: 'unavailable', service: 'restaurante-api' });
    expect(body).not.toContain(driverMessage);
  });
});

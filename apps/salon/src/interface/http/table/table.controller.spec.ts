import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { ActiveOrdersQuery } from '../../../application/ports/active-orders-query';
import type { TableRepository } from '../../../application/ports/table-repository';
import { ActivateTable } from '../../../application/table/activate-table';
import { CreateTable } from '../../../application/table/create-table';
import { DeactivateTable } from '../../../application/table/deactivate-table';
import { GetTable } from '../../../application/table/get-table';
import { InMemoryTableRepository } from '../../../application/table/in-memory-table-repository';
import { ListTables } from '../../../application/table/list-tables';
import { UpdateTable } from '../../../application/table/update-table';
import { Table } from '../../../domain/table/table';
import { TableController } from './table.controller';

function query(active: boolean): ActiveOrdersQuery {
  return { hasActiveOrder: async () => active };
}

function testModule(tables: TableRepository, activeOrders: ActiveOrdersQuery) {
  @Module({
    controllers: [TableController],
    providers: [
      { provide: CreateTable, useValue: new CreateTable(tables) },
      { provide: ListTables, useValue: new ListTables(tables) },
      { provide: GetTable, useValue: new GetTable(tables) },
      { provide: UpdateTable, useValue: new UpdateTable(tables) },
      { provide: DeactivateTable, useValue: new DeactivateTable(tables, activeOrders) },
      { provide: ActivateTable, useValue: new ActivateTable(tables) },
    ],
  })
  class TableHttpModule {}

  return TableHttpModule;
}

describe('tables HTTP', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function listen(
    seed: readonly Table[] = [],
    activeOrders: ActiveOrdersQuery = query(false),
  ): Promise<{ base: string }> {
    const tables = new InMemoryTableRepository(seed);
    app = await NestFactory.create(testModule(tables, activeOrders), { logger: false });
    await app.listen(0);
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('HTTP server did not bind a port');
    }
    return { base: `http://127.0.0.1:${address.port}` };
  }

  async function send(url: string, method: string, body?: unknown): Promise<Response> {
    return fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it('lists seeded tables (H1)', async () => {
    const seed = ['1', '2', '3', '4', '5', '6'].map((id) =>
      Table.create({ id, label: id, zone: 'Salón' }),
    );
    const { base } = await listen(seed);

    const response = await send(`${base}/tables`, 'GET');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(6);
    expect(body[0]).toEqual({ id: '1', label: '1', zone: 'Salón', active: true });
  });

  it('creates a table (H2)', async () => {
    const { base } = await listen();

    const response = await send(`${base}/tables`, 'POST', { id: '7', label: '7' });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ id: '7', label: '7', zone: 'Salón', active: true });
  });

  it('rejects a duplicate table id (H3)', async () => {
    const { base } = await listen([Table.create({ id: '7', label: '7', zone: 'Salón' })]);

    const response = await send(`${base}/tables`, 'POST', { id: '7', label: 'otra' });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: 'TableAlreadyExistsError',
      message: 'Table already exists',
    });
  });

  it('rejects deactivate when the query reports an active order (H4)', async () => {
    const { base } = await listen([Table.create({ id: '1', label: '1', zone: 'Salón' })], query(true));

    const response = await send(`${base}/tables/1/deactivate`, 'POST', {});

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: 'TableHasActiveOrderError',
      message: 'Table has an active order and cannot be deactivated',
    });
  });

  it('updates, deactivates and activates a free table', async () => {
    const { base } = await listen([Table.create({ id: '2', label: '2', zone: 'Salón' })]);

    const updated = await send(`${base}/tables/2`, 'PATCH', {
      label: 'Ventana',
      zone: 'Terraza',
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      id: '2',
      label: 'Ventana',
      zone: 'Terraza',
      active: true,
    });

    const inactive = await send(`${base}/tables/2/deactivate`, 'POST', {});
    expect(inactive.status).toBe(200);
    expect((await inactive.json()).active).toBe(false);

    const active = await send(`${base}/tables/2/activate`, 'POST', {});
    expect(active.status).toBe(200);
    expect((await active.json()).active).toBe(true);
  });
});

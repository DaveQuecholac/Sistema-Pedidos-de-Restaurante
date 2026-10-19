import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryOrderRepository } from '../../../application/order/in-memory-order-repository';
import type { OrderRepository } from '../../../application/ports/order-repository';
import type { TableRepository } from '../../../application/ports/table-repository';
import { ActivateTable } from '../../../application/table/activate-table';
import { CreateTable } from '../../../application/table/create-table';
import { DeactivateTable } from '../../../application/table/deactivate-table';
import { GetTable } from '../../../application/table/get-table';
import { InMemoryTableRepository } from '../../../application/table/in-memory-table-repository';
import { ListTables } from '../../../application/table/list-tables';
import { UpdateTable } from '../../../application/table/update-table';
import { Order } from '../../../domain/order/order';
import { OrderOrigin } from '../../../domain/order/order-origin';
import { Table } from '../../../domain/table/table';
import { OpenOrder } from '../../../application/order/open-order';
import { OrderController } from '../order/order.controller';
import { ListOrders } from '../../../application/order/list-orders';
import { GetOrder } from '../../../application/order/get-order';
import { AddLine } from '../../../application/order/add-line';
import { ModifyLine } from '../../../application/order/modify-line';
import { CancelLine } from '../../../application/order/cancel-line';
import { SendToKitchen } from '../../../application/order/send-to-kitchen';
import { BeginCooking } from '../../../application/order/begin-cooking';
import { MarkOrderReady } from '../../../application/order/mark-order-ready';
import { CancelOrder } from '../../../application/order/cancel-order';
import { InMemoryMenuRepository } from '../../../application/menu/in-memory-menu-repository';
import { TableController } from './table.controller';

const OPENED_AT = new Date('2026-10-04T18:00:00.000Z');

function testModule(tables: TableRepository, orders: OrderRepository) {
  @Module({
    controllers: [TableController, OrderController],
    providers: [
      { provide: CreateTable, useValue: new CreateTable(tables) },
      { provide: ListTables, useValue: new ListTables(tables) },
      { provide: GetTable, useValue: new GetTable(tables) },
      { provide: UpdateTable, useValue: new UpdateTable(tables) },
      { provide: DeactivateTable, useValue: new DeactivateTable(tables, orders) },
      { provide: ActivateTable, useValue: new ActivateTable(tables) },
      {
        provide: OpenOrder,
        useValue: new OpenOrder(orders, tables, () => `order-${crypto.randomUUID()}`, () => OPENED_AT),
      },
      { provide: ListOrders, useValue: new ListOrders(orders) },
      { provide: GetOrder, useValue: new GetOrder(orders) },
      {
        provide: AddLine,
        useValue: new AddLine(orders, new InMemoryMenuRepository(), () => 'line-1'),
      },
      {
        provide: ModifyLine,
        useValue: new ModifyLine(orders, new InMemoryMenuRepository()),
      },
      { provide: CancelLine, useValue: new CancelLine(orders) },
      { provide: SendToKitchen, useValue: new SendToKitchen(orders) },
      { provide: BeginCooking, useValue: new BeginCooking(orders) },
      { provide: MarkOrderReady, useValue: new MarkOrderReady(orders) },
      { provide: CancelOrder, useValue: new CancelOrder(orders) },
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

  async function listen(seed: readonly Table[] = []): Promise<{
    base: string;
    tables: InMemoryTableRepository;
    orders: InMemoryOrderRepository;
  }> {
    const tables = new InMemoryTableRepository(seed);
    const orders = new InMemoryOrderRepository();
    app = await NestFactory.create(testModule(tables, orders), { logger: false });
    await app.listen(0);
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('HTTP server did not bind a port');
    }
    return {
      base: `http://127.0.0.1:${address.port}`,
      tables,
      orders,
    };
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

  it('rejects deactivate when the table has an active order (H4)', async () => {
    const { base, orders } = await listen([
      Table.create({ id: '1', label: '1', zone: 'Salón' }),
    ]);
    await orders.add(
      Order.open({ id: 'order-1', origin: OrderOrigin.table('1'), openedAt: OPENED_AT }),
    );

    const response = await send(`${base}/tables/1/deactivate`, 'POST', {});

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: 'TableHasActiveOrderError',
      message: 'Table has an active order and cannot be deactivated',
    });
  });

  it('rejects open order for a missing table (H5)', async () => {
    const { base } = await listen([Table.create({ id: '1', label: '1', zone: 'Salón' })]);

    const response = await send(`${base}/orders`, 'POST', { tableId: '999' });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      code: 'TableNotFoundError',
      message: 'Table was not found',
    });
  });

  it('rejects a second active order on the same table (H6)', async () => {
    const { base } = await listen([Table.create({ id: '5', label: '5', zone: 'Salón' })]);

    const first = await send(`${base}/orders`, 'POST', { tableId: '5' });
    const second = await send(`${base}/orders`, 'POST', { tableId: '5' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({
      code: 'TableAlreadyHasActiveOrderError',
      message: 'Table already has an active order',
    });
  });

  it('opens an external order without a table (H7)', async () => {
    const { base } = await listen();

    const response = await send(`${base}/orders`, 'POST', { externalOrderId: 'PL-1' });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.externalOrderId).toBe('PL-1');
    expect(body.tableId).toBeNull();
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

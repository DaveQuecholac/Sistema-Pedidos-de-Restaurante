import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import { InMemoryMenuRepository } from '../../../application/menu/in-memory-menu-repository';
import { AddLine } from '../../../application/order/add-line';
import { CancelLine } from '../../../application/order/cancel-line';
import { CancelOrder } from '../../../application/order/cancel-order';
import { GetOrder } from '../../../application/order/get-order';
import { InMemoryOrderRepository } from '../../../application/order/in-memory-order-repository';
import { ListOrders } from '../../../application/order/list-orders';
import { MarkOrderReady } from '../../../application/order/mark-order-ready';
import { ModifyLine } from '../../../application/order/modify-line';
import { OpenOrder } from '../../../application/order/open-order';
import {
  FIXED_NOW,
  FLAN_ID,
  OTHER_EXTRA_ID,
  QUESO_ID,
  TACOS_ID,
  flanDish,
  otherDishWithExtra,
  tacosDish,
  withConcurrentSave,
} from '../../../application/order/order-test-fixtures';
import { StartCooking } from '../../../application/order/start-cooking';
import type { MenuRepository } from '../../../application/ports/menu-repository';
import type { OrderRepository } from '../../../application/ports/order-repository';
import { OrderController } from './order.controller';
import {
  addLineBodySchema,
  emptyOrderBodySchema,
  listOrdersQuerySchema,
  openOrderBodySchema,
} from './order.schema';

type OrderCalls = { add: number; save: number };

function orderIds(): () => string {
  let issued = 0;
  return () => {
    issued += 1;
    return `order-${issued}`;
  };
}

function lineIds(): () => string {
  let issued = 0;
  return () => {
    issued += 1;
    return `line-${issued}`;
  };
}

function watchOrders(orders: InMemoryOrderRepository): {
  port: OrderRepository;
  calls: OrderCalls;
} {
  const calls = { add: 0, save: 0 };
  const port: OrderRepository = {
    async add(order) {
      calls.add += 1;
      await orders.add(order);
    },
    async save(order) {
      calls.save += 1;
      await orders.save(order);
    },
    findById: (id) => orders.findById(id),
    findByExternalOrderId: (id) => orders.findByExternalOrderId(id),
    list: (filter) => orders.list(filter),
  };
  return { port, calls };
}

async function seedCatalog(): Promise<InMemoryMenuRepository> {
  const menu = new InMemoryMenuRepository();
  await menu.add(tacosDish());
  await menu.add(flanDish());
  await menu.add(otherDishWithExtra());
  return menu;
}

function testModule(
  orders: OrderRepository,
  menu: MenuRepository,
  generateOrderId: () => string = orderIds(),
  generateLineId: () => string = lineIds(),
) {
  @Module({
    controllers: [OrderController],
    providers: [
      { provide: OpenOrder, useValue: new OpenOrder(orders, generateOrderId, () => FIXED_NOW) },
      { provide: ListOrders, useValue: new ListOrders(orders) },
      { provide: GetOrder, useValue: new GetOrder(orders) },
      { provide: AddLine, useValue: new AddLine(orders, menu, generateLineId) },
      { provide: ModifyLine, useValue: new ModifyLine(orders, menu) },
      { provide: CancelLine, useValue: new CancelLine(orders) },
      { provide: StartCooking, useValue: new StartCooking(orders) },
      { provide: MarkOrderReady, useValue: new MarkOrderReady(orders) },
      { provide: CancelOrder, useValue: new CancelOrder(orders) },
    ],
  })
  class OrderHttpModule {}

  return OrderHttpModule;
}

function invalidRequest(schema: ZodType, body: unknown) {
  const parsed = schema.safeParse(body);
  if (parsed.success) {
    throw new Error('expected the body to fail validation');
  }

  const issue = parsed.error.issues[0];
  if (issue === undefined) {
    throw new Error('expected a Zod issue');
  }

  return { code: 'InvalidRequest', message: issue.message };
}

describe('orders HTTP', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function listen(options?: {
    orders?: OrderRepository;
    menu?: MenuRepository;
    track?: InMemoryOrderRepository;
  }): Promise<{
    base: string;
    orders: InMemoryOrderRepository;
    calls: OrderCalls;
  }> {
    const tracked = options?.track ?? new InMemoryOrderRepository();
    const seen = options?.orders
      ? { port: options.orders, calls: { add: 0, save: 0 } }
      : watchOrders(tracked);
    const menu = options?.menu ?? (await seedCatalog());

    app = await NestFactory.create(testModule(seen.port, menu), { logger: false });
    await app.listen(0);
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('HTTP server did not bind a port');
    }

    return {
      base: `http://127.0.0.1:${address.port}`,
      orders: tracked,
      calls: seen.calls,
    };
  }

  async function send(url: string, method: string, body?: unknown): Promise<Response> {
    return fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function openTable(base: string, tableId = '5') {
    const response = await send(`${base}/orders`, 'POST', { tableId });
    expect(response.status).toBe(201);
    return response.json();
  }

  async function addTacos(base: string, orderId: string, quantity = 2, modifierIds = [QUESO_ID]) {
    const response = await send(`${base}/orders/${orderId}/lines`, 'POST', {
      menuItemId: TACOS_ID,
      quantity,
      modifierIds,
    });
    expect(response.status).toBe(201);
    return response.json();
  }

  it('opens an order by table (H1)', async () => {
    const { base } = await listen();
    const response = await send(`${base}/orders`, 'POST', { tableId: '5' });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      id: 'order-1',
      tableId: '5',
      externalOrderId: null,
      status: 'OPEN',
      openedAt: FIXED_NOW.toISOString(),
      allowedActions: ['editLines', 'cancel'],
      lines: [],
    });
  });

  it('opens an order by external id (H2)', async () => {
    const { base } = await listen();
    const response = await send(`${base}/orders`, 'POST', { externalOrderId: 'UBER-1' });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.id).toBe('order-1');
    expect(body.tableId).toBeNull();
    expect(body.externalOrderId).toBe('UBER-1');
    expect(body.status).toBe('OPEN');
  });

  it('rejects empty origin and both origins (H3)', async () => {
    const { base } = await listen();
    const empty = await send(`${base}/orders`, 'POST', {});
    const both = await send(`${base}/orders`, 'POST', {
      tableId: '5',
      externalOrderId: 'UBER-1',
    });

    expect(empty.status).toBe(422);
    expect(await empty.json()).toEqual({
      code: 'InvalidOrderOriginError',
      message: 'Order origin must be exactly one of tableId or externalOrderId',
    });
    expect(both.status).toBe(422);
    expect(await both.json()).toEqual({
      code: 'InvalidOrderOriginError',
      message: 'Order origin must be exactly one of tableId or externalOrderId',
    });
  });

  it('rejects a blank table id (H4)', async () => {
    const { base } = await listen();
    const response = await send(`${base}/orders`, 'POST', { tableId: '   ' });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      code: 'InvalidTableIdError',
      message: 'Table id must be 1 to 40 characters after trim',
    });
  });

  it('rejects a wrong type or an extra field (H5)', async () => {
    const { base } = await listen();
    const numberId = { tableId: 5 };
    const extra = { tableId: '5', note: 'x' };
    const typed = await send(`${base}/orders`, 'POST', numberId);
    const withExtra = await send(`${base}/orders`, 'POST', extra);

    expect(typed.status).toBe(400);
    expect(await typed.json()).toEqual(invalidRequest(openOrderBodySchema, numberId));
    expect(withExtra.status).toBe(400);
    expect(await withExtra.json()).toEqual(invalidRequest(openOrderBodySchema, extra));
  });

  it('allows a second table order and rejects a repeated external id (H6)', async () => {
    const { base } = await listen();
    const first = await openTable(base, '5');
    const second = await send(`${base}/orders`, 'POST', { tableId: '5' });
    const secondBody = await second.json();
    await send(`${base}/orders`, 'POST', { externalOrderId: 'UBER-1' });
    const duplicate = await send(`${base}/orders`, 'POST', { externalOrderId: 'UBER-1' });

    expect(first.id).toBe('order-1');
    expect(second.status).toBe(201);
    expect(secondBody.id).toBe('order-2');
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({
      code: 'ExternalOrderIdInUseError',
      message: 'External order id is already in use',
    });
  });

  it('gets an order and answers not found (H7)', async () => {
    const { base } = await listen();
    const created = await openTable(base);
    const found = await send(`${base}/orders/${created.id}`, 'GET');
    const missing = await send(`${base}/orders/no-existe`, 'GET');

    expect(found.status).toBe(200);
    expect((await found.json()).id).toBe(created.id);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      code: 'OrderNotFoundError',
      message: 'Order was not found',
    });
  });

  it('adds a tacos line with queso (H8)', async () => {
    const { base } = await listen();
    const created = await openTable(base);
    const response = await send(`${base}/orders/${created.id}/lines`, 'POST', {
      menuItemId: TACOS_ID,
      quantity: 2,
      modifierIds: [QUESO_ID],
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]).toMatchObject({
      id: 'line-1',
      menuItemId: TACOS_ID,
      name: 'Tacos',
      quantity: 2,
      unitPrice: { amount: 4500, currency: 'MXN' },
      applicableTax: { basisPoints: 1600 },
      modifiers: [
        {
          modifierId: QUESO_ID,
          name: 'Queso',
          kind: 'extra',
          price: { amount: 1500, currency: 'MXN' },
        },
      ],
    });
    expect(body.allowedActions).toContain('startCooking');
  });

  it('rejects quantity 0 and 100 without saving (H9)', async () => {
    const { base, calls } = await listen();
    const created = await openTable(base);
    const zero = await send(`${base}/orders/${created.id}/lines`, 'POST', {
      menuItemId: TACOS_ID,
      quantity: 0,
      modifierIds: [],
    });
    const hundred = await send(`${base}/orders/${created.id}/lines`, 'POST', {
      menuItemId: TACOS_ID,
      quantity: 100,
      modifierIds: [],
    });

    expect(zero.status).toBe(422);
    expect(await zero.json()).toEqual({
      code: 'InvalidQuantityError',
      message: 'Quantity must be an integer from 1 to 99',
    });
    expect(hundred.status).toBe(422);
    expect(await hundred.json()).toEqual({
      code: 'InvalidQuantityError',
      message: 'Quantity must be an integer from 1 to 99',
    });
    expect(calls.save).toBe(0);
  });

  it('rejects a string quantity (H10)', async () => {
    const { base } = await listen();
    const created = await openTable(base);
    const body = { menuItemId: TACOS_ID, quantity: '2', modifierIds: [] };
    const response = await send(`${base}/orders/${created.id}/lines`, 'POST', body);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(invalidRequest(addLineBodySchema, body));
  });

  it('rejects a missing menu item without saving (H11)', async () => {
    const { base, calls } = await listen();
    const created = await openTable(base);
    const response = await send(`${base}/orders/${created.id}/lines`, 'POST', {
      menuItemId: 'missing',
      quantity: 1,
      modifierIds: [],
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      code: 'MenuItemNotFoundError',
      message: 'Menu item was not found',
    });
    expect(calls.save).toBe(0);
  });

  it('rejects an inactive menu item without saving (H12)', async () => {
    const { base, calls } = await listen();
    const created = await openTable(base);
    const response = await send(`${base}/orders/${created.id}/lines`, 'POST', {
      menuItemId: FLAN_ID,
      quantity: 1,
      modifierIds: [],
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      code: 'MenuItemUnavailableError',
      message: 'Menu item is not available for ordering',
    });
    expect(calls.save).toBe(0);
  });

  it('rejects a foreign or duplicate modifier without saving (H13)', async () => {
    const { base, calls } = await listen();
    const created = await openTable(base);
    const foreign = await send(`${base}/orders/${created.id}/lines`, 'POST', {
      menuItemId: TACOS_ID,
      quantity: 1,
      modifierIds: [OTHER_EXTRA_ID],
    });
    const duplicate = await send(`${base}/orders/${created.id}/lines`, 'POST', {
      menuItemId: TACOS_ID,
      quantity: 1,
      modifierIds: [QUESO_ID, QUESO_ID],
    });

    expect(foreign.status).toBe(422);
    expect(await foreign.json()).toEqual({
      code: 'UnknownModifierError',
      message: 'Selected modifier does not belong to the menu item',
    });
    expect(duplicate.status).toBe(422);
    expect(await duplicate.json()).toEqual({
      code: 'DuplicateModifierSelectionError',
      message: 'The same modifier cannot be selected twice',
    });
    expect(calls.save).toBe(0);
  });

  it('modifies a line quantity and keeps the line id (H14)', async () => {
    const { base } = await listen();
    const created = await openTable(base);
    const withLine = await addTacos(base, created.id);
    const lineId = withLine.lines[0].id;
    const response = await send(`${base}/orders/${created.id}/lines/${lineId}`, 'PATCH', {
      quantity: 3,
      modifierIds: [QUESO_ID],
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0].id).toBe(lineId);
    expect(body.lines[0].quantity).toBe(3);
  });

  it('answers not found for a missing line on patch or delete (H15)', async () => {
    const { base } = await listen();
    const created = await openTable(base);
    await addTacos(base, created.id);
    const patch = await send(`${base}/orders/${created.id}/lines/no-line`, 'PATCH', {
      quantity: 1,
      modifierIds: [],
    });
    const remove = await send(`${base}/orders/${created.id}/lines/no-line`, 'DELETE');

    expect(patch.status).toBe(404);
    expect(await patch.json()).toEqual({
      code: 'LineItemNotFoundError',
      message: 'Line item was not found on the order',
    });
    expect(remove.status).toBe(404);
    expect(await remove.json()).toEqual({
      code: 'LineItemNotFoundError',
      message: 'Line item was not found on the order',
    });
  });

  it('deletes a line (H16)', async () => {
    const { base } = await listen();
    const created = await openTable(base);
    const withLine = await addTacos(base, created.id);
    const lineId = withLine.lines[0].id;
    const response = await send(`${base}/orders/${created.id}/lines/${lineId}`, 'DELETE');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.lines).toEqual([]);
  });

  it('rejects start-cooking on an empty order without saving (H17)', async () => {
    const { base, calls } = await listen();
    const created = await openTable(base);
    const response = await send(`${base}/orders/${created.id}/start-cooking`, 'POST', {});

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      code: 'EmptyOrderError',
      message: 'Cannot start cooking an order with no lines',
    });
    expect(calls.save).toBe(0);
  });

  it('starts cooking when the order has lines (H18)', async () => {
    const { base } = await listen();
    const created = await openTable(base);
    await addTacos(base, created.id);
    const response = await send(`${base}/orders/${created.id}/start-cooking`, 'POST', {});
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('IN_KITCHEN');
    expect(body.allowedActions).toEqual(['markReady', 'cancel']);
  });

  it('rejects line edits while in kitchen without saving (H19)', async () => {
    const { base, calls } = await listen();
    const created = await openTable(base);
    const withLine = await addTacos(base, created.id);
    const lineId = withLine.lines[0].id;
    await send(`${base}/orders/${created.id}/start-cooking`, 'POST', {});
    const savesBefore = calls.save;

    const add = await send(`${base}/orders/${created.id}/lines`, 'POST', {
      menuItemId: TACOS_ID,
      quantity: 1,
      modifierIds: [],
    });
    const patch = await send(`${base}/orders/${created.id}/lines/${lineId}`, 'PATCH', {
      quantity: 3,
      modifierIds: [QUESO_ID],
    });
    const remove = await send(`${base}/orders/${created.id}/lines/${lineId}`, 'DELETE');
    const current = await (await send(`${base}/orders/${created.id}`, 'GET')).json();

    expect(add.status).toBe(409);
    expect(await add.json()).toEqual({
      code: 'OrderNotEditableError',
      message: 'Order lines cannot be edited in the current status',
    });
    expect(patch.status).toBe(409);
    expect(remove.status).toBe(409);
    expect(calls.save).toBe(savesBefore);
    expect(current.lines).toHaveLength(1);
    expect(current.lines[0].id).toBe(lineId);
    expect(current.lines[0].quantity).toBe(2);
  });

  it('rejects starting cooking twice (H20)', async () => {
    const { base } = await listen();
    const created = await openTable(base);
    await addTacos(base, created.id);
    await send(`${base}/orders/${created.id}/start-cooking`, 'POST', {});
    const response = await send(`${base}/orders/${created.id}/start-cooking`, 'POST', {});

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: 'InvalidOrderTransitionError',
      message: 'That order status transition is not allowed',
    });
  });

  it('marks the order ready (H21)', async () => {
    const { base } = await listen();
    const created = await openTable(base);
    await addTacos(base, created.id);
    await send(`${base}/orders/${created.id}/start-cooking`, 'POST', {});
    const response = await send(`${base}/orders/${created.id}/mark-ready`, 'POST', {});
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('READY');
    expect(body.allowedActions).toEqual([]);
  });

  it('rejects cancel on READY and cancels an OPEN order (H22)', async () => {
    const { base } = await listen();
    const ready = await openTable(base, '5');
    await addTacos(base, ready.id);
    await send(`${base}/orders/${ready.id}/start-cooking`, 'POST', {});
    await send(`${base}/orders/${ready.id}/mark-ready`, 'POST', {});
    const reject = await send(`${base}/orders/${ready.id}/cancel`, 'POST', {});

    const open = await openTable(base, '6');
    const cancelled = await send(`${base}/orders/${open.id}/cancel`, 'POST', {});

    expect(reject.status).toBe(409);
    expect(await reject.json()).toEqual({
      code: 'InvalidOrderTransitionError',
      message: 'That order status transition is not allowed',
    });
    expect(cancelled.status).toBe(200);
    expect((await cancelled.json()).status).toBe('CANCELLED');
  });

  it('lists by status filter and rejects unknown status (H23)', async () => {
    const { base } = await listen();
    const kitchen = await openTable(base, 'k');
    await addTacos(base, kitchen.id);
    await send(`${base}/orders/${kitchen.id}/start-cooking`, 'POST', {});
    const ready = await openTable(base, 'r');
    await addTacos(base, ready.id);
    await send(`${base}/orders/${ready.id}/start-cooking`, 'POST', {});
    await send(`${base}/orders/${ready.id}/mark-ready`, 'POST', {});
    const open = await openTable(base, 'o');

    const filtered = await send(`${base}/orders?status=IN_KITCHEN,READY`, 'GET');
    const filteredBody = await filtered.json();
    const unknown = await send(`${base}/orders?status=COOKING`, 'GET');
    const all = await send(`${base}/orders`, 'GET');
    const allBody = await all.json();

    expect(filtered.status).toBe(200);
    expect(filteredBody.map((order: { id: string }) => order.id).sort()).toEqual(
      [kitchen.id, ready.id].sort(),
    );
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual(
      invalidRequest(listOrdersQuerySchema, { status: 'COOKING' }),
    );
    expect(all.status).toBe(200);
    expect(allBody.map((order: { id: string }) => order.id)).toEqual(
      expect.arrayContaining([kitchen.id, ready.id, open.id]),
    );
  });

  it('does not invent a domain code for an unknown error (H24)', async () => {
    const menu = await seedCatalog();
    const orders: OrderRepository = {
      add: async () => undefined,
      save: async () => undefined,
      findById: async () => {
        throw new Error('boom');
      },
      findByExternalOrderId: async () => null,
      list: async () => [],
    };

    app = await NestFactory.create(testModule(orders, menu), { logger: false });
    await app.listen(0);
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('HTTP server did not bind a port');
    }
    const base = `http://127.0.0.1:${address.port}`;
    const response = await send(`${base}/orders/anything`, 'GET');
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBeUndefined();
  });

  it('rejects a concurrent add-line with 409 (H25)', async () => {
    const tracked = new InMemoryOrderRepository();
    const menu = await seedCatalog();
    const open = new OpenOrder(tracked, orderIds(), () => FIXED_NOW);
    const created = await open.execute({ tableId: '5' });
    const firstLine = new AddLine(tracked, menu, lineIds());
    await firstLine.execute({
      orderId: created.id,
      menuItemId: TACOS_ID,
      quantity: 1,
      modifierIds: [],
    });

    const concurrent = withConcurrentSave(tracked, (order) => order.startCooking());
    app = await NestFactory.create(
      testModule(concurrent, menu, orderIds(), () => 'line-2'),
      { logger: false },
    );
    await app.listen(0);
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('HTTP server did not bind a port');
    }
    const base = `http://127.0.0.1:${address.port}`;

    const response = await send(`${base}/orders/${created.id}/lines`, 'POST', {
      menuItemId: TACOS_ID,
      quantity: 1,
      modifierIds: [QUESO_ID],
    });
    const current = await (await send(`${base}/orders/${created.id}`, 'GET')).json();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: 'OrderConcurrencyError',
      message: 'Order was changed by another operation',
    });
    expect(current.status).toBe('IN_KITCHEN');
    expect(current.lines).toHaveLength(1);
    expect(current.lines[0].id).toBe('line-1');
  });

  it('rejects a body with fields on start-cooking', async () => {
    const { base } = await listen();
    const created = await openTable(base);
    await addTacos(base, created.id);
    const body = { note: 'x' };
    const response = await send(`${base}/orders/${created.id}/start-cooking`, 'POST', body);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(invalidRequest(emptyOrderBodySchema, body));
  });
});

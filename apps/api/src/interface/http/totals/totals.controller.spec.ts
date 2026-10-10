import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryMenuRepository } from '../../../application/menu/in-memory-menu-repository';
import { AddLine } from '../../../application/order/add-line';
import { BeginCooking } from '../../../application/order/begin-cooking';
import { CancelLine } from '../../../application/order/cancel-line';
import { CancelOrder } from '../../../application/order/cancel-order';
import { GetOrder } from '../../../application/order/get-order';
import { InMemoryOrderRepository } from '../../../application/order/in-memory-order-repository';
import { ListOrders } from '../../../application/order/list-orders';
import { MarkOrderReady } from '../../../application/order/mark-order-ready';
import { ModifyLine } from '../../../application/order/modify-line';
import { OpenOrder } from '../../../application/order/open-order';
import type { TableRepository } from '../../../application/ports/table-repository';
import {
  DEMO_SALON_TABLE_IDS,
  salonTables,
} from '../../../application/table/salon-tables';
import {
  AGUA_ID,
  FIXED_NOW,
  QUESO_ID,
  TACOS_ID,
  aguaDish,
  tacosDish,
  withConcurrentSave,
} from '../../../application/order/order-test-fixtures';
import { SendToKitchen } from '../../../application/order/send-to-kitchen';
import type { MenuRepository } from '../../../application/ports/menu-repository';
import type { OrderRepository } from '../../../application/ports/order-repository';
import { CalculateTotals } from '../../../application/totals/calculate-totals';
import { SetOrderDiscount } from '../../../application/totals/set-order-discount';
import { SetOrderTip } from '../../../application/totals/set-order-tip';
import { TaxRate } from '../../../domain/menu/tax-rate';
import { Money } from '../../../domain/money/money';
import { LineItem } from '../../../domain/order/line-item';
import { Order } from '../../../domain/order/order';
import { OrderOrigin } from '../../../domain/order/order-origin';
import { Quantity } from '../../../domain/order/quantity';
import { Tip } from '../../../domain/totals/tip';
import { OrderController } from '../order/order.controller';
import { presentOrder } from '../order/order.presenter';
import { TotalsController } from './totals.controller';
import { setDiscountBodySchema, setTipBodySchema } from './totals.schema';

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
    findActiveByTableId: (tableId) => orders.findActiveByTableId(tableId),
    list: (filter) => orders.list(filter),
  };
  return { port, calls };
}

async function seedCatalog(): Promise<InMemoryMenuRepository> {
  const menu = new InMemoryMenuRepository();
  await menu.add(tacosDish());
  await menu.add(aguaDish());
  return menu;
}

function testModule(
  orders: OrderRepository,
  menu: MenuRepository,
  tables: TableRepository = salonTables(...DEMO_SALON_TABLE_IDS),
  generateOrderId: () => string = orderIds(),
  generateLineId: () => string = lineIds(),
) {
  @Module({
    controllers: [OrderController, TotalsController],
    providers: [
      {
        provide: OpenOrder,
        useValue: new OpenOrder(orders, tables, generateOrderId, () => FIXED_NOW),
      },
      { provide: ListOrders, useValue: new ListOrders(orders) },
      { provide: GetOrder, useValue: new GetOrder(orders) },
      { provide: AddLine, useValue: new AddLine(orders, menu, generateLineId) },
      { provide: ModifyLine, useValue: new ModifyLine(orders, menu) },
      { provide: CancelLine, useValue: new CancelLine(orders) },
      { provide: SendToKitchen, useValue: new SendToKitchen(orders) },
      { provide: BeginCooking, useValue: new BeginCooking(orders) },
      { provide: MarkOrderReady, useValue: new MarkOrderReady(orders) },
      { provide: CancelOrder, useValue: new CancelOrder(orders) },
      { provide: CalculateTotals, useValue: new CalculateTotals(orders) },
      { provide: SetOrderDiscount, useValue: new SetOrderDiscount(orders) },
      { provide: SetOrderTip, useValue: new SetOrderTip(orders) },
    ],
  })
  class TotalsHttpModule {}

  return TotalsHttpModule;
}

describe('totals HTTP', () => {
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

  async function openOrderL(base: string): Promise<string> {
    const opened = await send(`${base}/orders`, 'POST', { tableId: '5' });
    expect(opened.status).toBe(201);
    const order = await opened.json();

    const tacos = await send(`${base}/orders/${order.id}/lines`, 'POST', {
      menuItemId: TACOS_ID,
      quantity: 2,
      modifierIds: [QUESO_ID],
    });
    expect(tacos.status).toBe(201);

    const agua = await send(`${base}/orders/${order.id}/lines`, 'POST', {
      menuItemId: AGUA_ID,
      quantity: 1,
      modifierIds: [],
    });
    expect(agua.status).toBe(201);

    return order.id as string;
  }

  it('returns the TT3 breakdown for order L (H26)', async () => {
    const { base } = await listen();
    const orderId = await openOrderL(base);

    const response = await send(`${base}/orders/${orderId}/totals`, 'GET');
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.orderId).toBe(orderId);
    expect(body.currency).toBe('MXN');
    expect(body.adjustable).toBe(true);
    expect(body.discount).toBeNull();
    expect(body.tip).toBeNull();
    expect(body.subtotal).toEqual({ amount: 14500, currency: 'MXN' });
    expect(body.taxTotal).toEqual({ amount: 1920, currency: 'MXN' });
    expect(body.total).toEqual({ amount: 16420, currency: 'MXN' });
    expect(body.taxes).toEqual([
      {
        basisPoints: 0,
        taxableBase: { amount: 2500, currency: 'MXN' },
        amount: { amount: 0, currency: 'MXN' },
      },
      {
        basisPoints: 1600,
        taxableBase: { amount: 12000, currency: 'MXN' },
        amount: { amount: 1920, currency: 'MXN' },
      },
    ]);
    expect(body.lines).toHaveLength(2);
    expect(body.lines[0]).toMatchObject({
      quantity: 2,
      unitAmount: { amount: 6000, currency: 'MXN' },
      lineSubtotal: { amount: 12000, currency: 'MXN' },
      applicableTax: { basisPoints: 1600 },
    });
    expect(body.lines[1]).toMatchObject({
      quantity: 1,
      unitAmount: { amount: 2500, currency: 'MXN' },
      lineSubtotal: { amount: 2500, currency: 'MXN' },
      applicableTax: { basisPoints: 0 },
    });
  });

  it('returns 404 for a missing order totals (H27)', async () => {
    const { base } = await listen();
    const response = await send(`${base}/orders/no-existe/totals`, 'GET');
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'OrderNotFoundError' });
  });

  it('applies a 10 percent discount (H28)', async () => {
    const { base } = await listen();
    const orderId = await openOrderL(base);

    const response = await send(`${base}/orders/${orderId}/discount`, 'PUT', {
      discount: { kind: 'percentage', basisPoints: 1000 },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.discount).toEqual({
      kind: 'percentage',
      basisPoints: 1000,
      amount: { amount: 1450, currency: 'MXN' },
    });
    expect(body.total).toEqual({ amount: 14778, currency: 'MXN' });
  });

  it('applies a fixed discount of 5000 (H29)', async () => {
    const { base } = await listen();
    const orderId = await openOrderL(base);

    const response = await send(`${base}/orders/${orderId}/discount`, 'PUT', {
      discount: { kind: 'fixedAmount', amount: 5000 },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.discount).toEqual({
      kind: 'fixedAmount',
      requested: { amount: 5000, currency: 'MXN' },
      amount: { amount: 5000, currency: 'MXN' },
    });
    expect(body.total).toEqual({ amount: 10758, currency: 'MXN' });
  });

  it('clears a discount with null (H30)', async () => {
    const { base } = await listen();
    const orderId = await openOrderL(base);
    await send(`${base}/orders/${orderId}/discount`, 'PUT', {
      discount: { kind: 'percentage', basisPoints: 1000 },
    });

    const response = await send(`${base}/orders/${orderId}/discount`, 'PUT', {
      discount: null,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.discount).toBeNull();
    expect(body.total).toEqual({ amount: 16420, currency: 'MXN' });
  });

  it('applies tip after discount (H31)', async () => {
    const { base } = await listen();
    const orderId = await openOrderL(base);
    await send(`${base}/orders/${orderId}/discount`, 'PUT', {
      discount: { kind: 'percentage', basisPoints: 1000 },
    });

    const response = await send(`${base}/orders/${orderId}/tip`, 'PUT', {
      tip: { kind: 'percentage', basisPoints: 1000 },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tip).toEqual({
      kind: 'percentage',
      basisPoints: 1000,
      amount: { amount: 1305, currency: 'MXN' },
    });
    expect(body.total).toEqual({ amount: 16083, currency: 'MXN' });
  });

  it('sets and clears a fixed tip (H32)', async () => {
    const { base } = await listen();
    const orderId = await openOrderL(base);

    const set = await send(`${base}/orders/${orderId}/tip`, 'PUT', {
      tip: { kind: 'fixedAmount', amount: 2000 },
    });
    expect(set.status).toBe(200);
    expect((await set.json()).tip).toEqual({
      kind: 'fixedAmount',
      amount: { amount: 2000, currency: 'MXN' },
    });

    const cleared = await send(`${base}/orders/${orderId}/tip`, 'PUT', { tip: null });
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).tip).toBeNull();
  });

  it('rejects malformed discount bodies with 400 (H33)', async () => {
    const { base, calls } = await listen();
    const orderId = await openOrderL(base);
    const savesBefore = calls.save;

    const bodies = [
      {},
      { discount: { kind: 'percentage', basisPoints: 1000 }, extra: true },
      { discount: { kind: 'percentage', basisPoints: '10' } },
      { discount: { basisPoints: 1000 } },
      { discount: { kind: 'coupon', basisPoints: 1000 } },
      { discount: { kind: 'fixedAmount', amount: '50' } },
    ];

    for (const body of bodies) {
      const response = await send(`${base}/orders/${orderId}/discount`, 'PUT', body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'InvalidRequest' });
    }
    expect(calls.save).toBe(savesBefore);
  });

  it('rejects out-of-range percentages with 422 (H34)', async () => {
    const { base, calls } = await listen();
    const orderId = await openOrderL(base);
    const savesBefore = calls.save;

    for (const basisPoints of [0, 10001, 1.5]) {
      const response = await send(`${base}/orders/${orderId}/discount`, 'PUT', {
        discount: { kind: 'percentage', basisPoints },
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ code: 'InvalidPercentageError' });
    }
    expect(calls.save).toBe(savesBefore);
  });

  it('rejects invalid fixed discount amounts with 422 (H35)', async () => {
    const { base, calls } = await listen();
    const orderId = await openOrderL(base);
    const savesBefore = calls.save;

    const zero = await send(`${base}/orders/${orderId}/discount`, 'PUT', {
      discount: { kind: 'fixedAmount', amount: 0 },
    });
    expect(zero.status).toBe(422);
    expect(await zero.json()).toMatchObject({ code: 'InvalidDiscountError' });

    const negative = await send(`${base}/orders/${orderId}/discount`, 'PUT', {
      discount: { kind: 'fixedAmount', amount: -5 },
    });
    expect(negative.status).toBe(422);
    expect(await negative.json()).toMatchObject({ code: 'InvalidMoneyError' });
    expect(calls.save).toBe(savesBefore);
  });

  it('rejects tip on CANCELLED and still returns totals (H36)', async () => {
    const { base, calls } = await listen();
    const orderId = await openOrderL(base);
    await send(`${base}/orders/${orderId}/cancel`, 'POST', {});
    const savesBefore = calls.save;

    const tip = await send(`${base}/orders/${orderId}/tip`, 'PUT', {
      tip: { kind: 'percentage', basisPoints: 1000 },
    });
    expect(tip.status).toBe(409);
    expect(await tip.json()).toMatchObject({ code: 'OrderTotalsNotAdjustableError' });
    expect(calls.save).toBe(savesBefore);

    const totals = await send(`${base}/orders/${orderId}/totals`, 'GET');
    expect(totals.status).toBe(200);
    expect((await totals.json()).adjustable).toBe(false);
  });

  it('allows tip in SENT_TO_KITCHEN, IN_KITCHEN and READY (H37)', async () => {
    const { base } = await listen();
    const orderId = await openOrderL(base);

    await send(`${base}/orders/${orderId}/send-to-kitchen`, 'POST', {});
    const sent = await send(`${base}/orders/${orderId}/tip`, 'PUT', {
      tip: { kind: 'percentage', basisPoints: 1000 },
    });
    expect(sent.status).toBe(200);

    await send(`${base}/orders/${orderId}/begin-cooking`, 'POST', {});
    const cooking = await send(`${base}/orders/${orderId}/tip`, 'PUT', {
      tip: { kind: 'percentage', basisPoints: 1500 },
    });
    expect(cooking.status).toBe(200);

    await send(`${base}/orders/${orderId}/mark-ready`, 'POST', {});
    const ready = await send(`${base}/orders/${orderId}/tip`, 'PUT', {
      tip: { kind: 'fixedAmount', amount: 2000 },
    });
    expect(ready.status).toBe(200);
  });

  it('rejects a concurrent tip save (H38)', async () => {
    const tracked = new InMemoryOrderRepository();
    const first = await listen({ track: tracked });
    const orderId = await openOrderL(first.base);
    await app!.close();
    app = undefined;

    const concurrent = withConcurrentSave(tracked, (order) =>
      order.setTip(Tip.fixedAmount(Money.of(2000, 'MXN'))),
    );
    const { base } = await listen({ orders: concurrent, track: tracked });

    const response = await send(`${base}/orders/${orderId}/tip`, 'PUT', {
      tip: { kind: 'percentage', basisPoints: 1000 },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'OrderConcurrencyError' });

    const totals = await send(`${base}/orders/${orderId}/totals`, 'GET');
    expect((await totals.json()).tip).toEqual({
      kind: 'fixedAmount',
      amount: { amount: 2000, currency: 'MXN' },
    });
  });

  it('returns 422 MoneyOverflowError for an overflowing order (H39)', async () => {
    const tracked = new InMemoryOrderRepository();
    await tracked.add(
      Order.restore({
        id: 'order-huge',
        origin: OrderOrigin.table('9'),
        status: 'OPEN',
        openedAt: FIXED_NOW,
        version: 0,
        discount: null,
        tip: null,
        payment: null,
        lines: [
          LineItem.restore({
            id: 'line-huge',
            menuItemId: TACOS_ID,
            name: 'Huge',
            unitPrice: Money.of(2_000_000_000, 'MXN'),
            applicableTax: TaxRate.of(1600),
            quantity: Quantity.of(2),
            modifiers: [],
          }),
        ],
      }),
    );
    const { base } = await listen({ track: tracked, orders: watchOrders(tracked).port });

    const response = await send(`${base}/orders/order-huge/totals`, 'GET');
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: 'MoneyOverflowError' });
  });

  it('returns 500 without inventing a domain code (H40)', async () => {
    const tracked = new InMemoryOrderRepository();
    const exploding: OrderRepository = {
      add: (order) => tracked.add(order),
      save: (order) => tracked.save(order),
      findByExternalOrderId: (id) => tracked.findByExternalOrderId(id),
      findActiveByTableId: (tableId) => tracked.findActiveByTableId(tableId),
      list: (filter) => tracked.list(filter),
      async findById(id) {
        if (id === 'boom') {
          throw new Error('unexpected failure');
        }
        return tracked.findById(id);
      },
    };
    const { base } = await listen({ orders: exploding, track: tracked });

    const response = await send(`${base}/orders/boom/totals`, 'GET');
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain('OrderNotFoundError');
    expect(body).not.toContain('InvalidPercentageError');
  });

  it('does not save on H33-H36 validation and status failures (H41)', async () => {
    const { base, calls } = await listen();
    const orderId = await openOrderL(base);
    await send(`${base}/orders/${orderId}/cancel`, 'POST', {});
    const savesBefore = calls.save;

    await send(`${base}/orders/${orderId}/discount`, 'PUT', {});
    await send(`${base}/orders/${orderId}/discount`, 'PUT', {
      discount: { kind: 'percentage', basisPoints: 0 },
    });
    await send(`${base}/orders/${orderId}/discount`, 'PUT', {
      discount: { kind: 'fixedAmount', amount: 0 },
    });
    await send(`${base}/orders/${orderId}/tip`, 'PUT', {
      tip: { kind: 'percentage', basisPoints: 1000 },
    });

    expect(calls.save).toBe(savesBefore);
  });

  it('rejects a body that includes orderId (H42)', async () => {
    const { base } = await listen();
    const orderId = await openOrderL(base);

    const response = await send(`${base}/orders/${orderId}/discount`, 'PUT', {
      orderId,
      discount: { kind: 'percentage', basisPoints: 1000 },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'InvalidRequest' });
  });

  it('keeps GET /orders/:id unchanged after adjustments (H43)', async () => {
    const { base } = await listen();
    const orderId = await openOrderL(base);
    await send(`${base}/orders/${orderId}/discount`, 'PUT', {
      discount: { kind: 'percentage', basisPoints: 1000 },
    });
    await send(`${base}/orders/${orderId}/tip`, 'PUT', {
      tip: { kind: 'percentage', basisPoints: 1000 },
    });

    const response = await send(`${base}/orders/${orderId}`, 'GET');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(
      Object.keys(
        presentOrder(
          Order.open({
            id: 'x',
            origin: OrderOrigin.table('1'),
            openedAt: FIXED_NOW,
          }),
        ),
      ).sort(),
    );
    expect(body).not.toHaveProperty('totals');
    expect(body).not.toHaveProperty('discount');
    expect(body).not.toHaveProperty('tip');
    expect(body.allowedActions).toEqual(['editLines', 'sendToKitchen', 'cancel']);
  });

  it('returns identical totals payloads on repeated GET (H44)', async () => {
    const { base } = await listen();
    const orderId = await openOrderL(base);

    const first = await send(`${base}/orders/${orderId}/totals`, 'GET');
    const second = await send(`${base}/orders/${orderId}/totals`, 'GET');
    expect(await first.text()).toBe(await second.text());
  });

  it('keeps Zod schemas aligned with the plan', () => {
    expect(setDiscountBodySchema.safeParse({ discount: null }).success).toBe(true);
    expect(setTipBodySchema.safeParse({ tip: { kind: 'percentage', basisPoints: 1000 } }).success).toBe(
      true,
    );
  });
});

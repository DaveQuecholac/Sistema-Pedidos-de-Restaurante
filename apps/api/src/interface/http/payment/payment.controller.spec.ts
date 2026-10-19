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
  readyOrderL,
  tacosDish,
  watchOrders,
  withConcurrentSave,
} from '../../../application/order/order-test-fixtures';
import { SendToKitchen } from '../../../application/order/send-to-kitchen';
import { CloseOrder } from '../../../application/payment/close-order';
import { FakePaymentPort } from '../../../application/payment/fake-payment-port';
import { GetOrderPayment } from '../../../application/payment/get-order-payment';
import type { MenuRepository } from '../../../application/ports/menu-repository';
import type { OrderRepository } from '../../../application/ports/order-repository';
import type { PaymentPort } from '../../../application/ports/payment-port';
import { CalculateTotals } from '../../../application/totals/calculate-totals';
import { SetOrderDiscount } from '../../../application/totals/set-order-discount';
import { SetOrderTip } from '../../../application/totals/set-order-tip';
import { Percentage } from '../../../domain/totals/percentage';
import { Tip } from '../../../domain/totals/tip';
import { CashPaymentAdapter } from '../../../infrastructure/payment/cash-payment-adapter';
import { CardPaymentAdapter } from '../../../infrastructure/payment/card-payment-adapter';
import { DigitalGatewayFakeAdapter } from '../../../infrastructure/payment/digital-gateway-fake-adapter';
import { OrderController } from '../order/order.controller';
import { TotalsController } from '../totals/totals.controller';
import { PaymentController } from './payment.controller';

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

function paymentIds(): () => string {
  let issued = 0;
  return () => {
    issued += 1;
    return `pay-${issued}`;
  };
}

function referenceIds(): () => string {
  let issued = 0;
  return () => {
    issued += 1;
    return `r${issued}`;
  };
}

function realPorts(): PaymentPort[] {
  return [
    new CashPaymentAdapter(referenceIds()),
    new CardPaymentAdapter(referenceIds()),
    new DigitalGatewayFakeAdapter(referenceIds()),
  ];
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
  payments: readonly PaymentPort[],
  tables: TableRepository = salonTables(...DEMO_SALON_TABLE_IDS),
  generateOrderId: () => string = orderIds(),
  generateLineId: () => string = lineIds(),
  generatePaymentId: () => string = paymentIds(),
) {
  @Module({
    controllers: [OrderController, TotalsController, PaymentController],
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
      {
        provide: CloseOrder,
        useValue: new CloseOrder(orders, payments, generatePaymentId, () => FIXED_NOW),
      },
      { provide: GetOrderPayment, useValue: new GetOrderPayment(orders) },
    ],
  })
  class PaymentHttpModule {}

  return PaymentHttpModule;
}

function assertProductVocabulary(body: unknown): void {
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/order_id|payment_id|tendered_amount|card_last4|"version"/);
}

describe('payment HTTP', () => {
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
    payments?: readonly PaymentPort[];
    paymentIds?: () => string;
  }): Promise<{
    base: string;
    orders: InMemoryOrderRepository;
    calls: OrderCalls;
    payments: readonly PaymentPort[];
  }> {
    const tracked = options?.track ?? new InMemoryOrderRepository();
    const seen = options?.orders
      ? { orders: options.orders, calls: { add: 0, save: 0 } }
      : watchOrders(tracked);
    const menu = options?.menu ?? (await seedCatalog());
    const payments = options?.payments ?? realPorts();

    app = await NestFactory.create(
      testModule(
        seen.orders,
        menu,
        payments,
        salonTables(...DEMO_SALON_TABLE_IDS),
        orderIds(),
        lineIds(),
        options?.paymentIds ?? paymentIds(),
      ),
      { logger: false },
    );
    await app.listen(0);
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('HTTP server did not bind a port');
    }

    return {
      base: `http://127.0.0.1:${address.port}`,
      orders: tracked,
      calls: seen.calls,
      payments,
    };
  }

  async function send(url: string, method: string, body?: unknown): Promise<Response> {
    return fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function readyOrderLViaHttp(base: string, tableId = '5'): Promise<string> {
    const opened = await send(`${base}/orders`, 'POST', { tableId });
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

    for (const action of ['send-to-kitchen', 'begin-cooking', 'mark-ready'] as const) {
      const response = await send(`${base}/orders/${order.id}/${action}`, 'POST', {});
      expect(response.status).toBe(200);
    }

    return order.id as string;
  }

  const cashClose = {
    expectedTotal: 16420,
    payment: { method: 'cash' as const, tendered: 20000 },
  };

  it('closes with cash and returns change (H45)', async () => {
    const { base } = await listen();
    const orderId = await readyOrderLViaHttp(base);

    const response = await send(`${base}/orders/${orderId}/close`, 'POST', cashClose);
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toEqual({
      orderId,
      status: 'CLOSED',
      payment: {
        id: 'pay-1',
        method: 'cash',
        amount: { amount: 16420, currency: 'MXN' },
        tendered: { amount: 20000, currency: 'MXN' },
        change: { amount: 3580, currency: 'MXN' },
        cardLast4: null,
        payerReference: null,
        reference: 'cash-r1',
        paidAt: FIXED_NOW.toISOString(),
      },
    });
    assertProductVocabulary(body);
  });

  it('closes with card (H46)', async () => {
    const { base } = await listen();
    const orderId = await readyOrderLViaHttp(base);

    const response = await send(`${base}/orders/${orderId}/close`, 'POST', {
      expectedTotal: 16420,
      payment: { method: 'card', cardLast4: '4242' },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.payment).toMatchObject({
      method: 'card',
      tendered: null,
      change: null,
      cardLast4: '4242',
      payerReference: null,
      reference: 'card-r1',
    });
    assertProductVocabulary(body);
  });

  it('closes with digital gateway (H47)', async () => {
    const { base } = await listen();
    const orderId = await readyOrderLViaHttp(base);

    const response = await send(`${base}/orders/${orderId}/close`, 'POST', {
      expectedTotal: 16420,
      payment: { method: 'digitalGateway', payerReference: 'cliente@correo.mx' },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.payment).toMatchObject({
      method: 'digitalGateway',
      tendered: null,
      change: null,
      cardLast4: null,
      payerReference: 'cliente@correo.mx',
      reference: 'gateway-r1',
    });
    assertProductVocabulary(body);
  });

  it('returns 402 when the card is declined and leaves READY (H48)', async () => {
    const { base } = await listen();
    const orderId = await readyOrderLViaHttp(base);

    const response = await send(`${base}/orders/${orderId}/close`, 'POST', {
      expectedTotal: 16420,
      payment: { method: 'card', cardLast4: '0002' },
    });
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: 'PaymentDeclinedError' });

    const order = await send(`${base}/orders/${orderId}`, 'GET');
    expect(order.status).toBe(200);
    const body = await order.json();
    expect(body.status).toBe('READY');
    expect(body.allowedActions).toEqual(['close']);
  });

  it('returns 503 when the card processor is down (H49)', async () => {
    const { base } = await listen();
    const orderId = await readyOrderLViaHttp(base);

    const response = await send(`${base}/orders/${orderId}/close`, 'POST', {
      expectedTotal: 16420,
      payment: { method: 'card', cardLast4: '0119' },
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'PaymentProcessorUnavailableError' });

    const order = await send(`${base}/orders/${orderId}`, 'GET');
    expect((await order.json()).status).toBe('READY');
  });

  it('maps gateway decline and outage (H50)', async () => {
    const { base } = await listen();
    const declinedId = await readyOrderLViaHttp(base, '5');
    const declined = await send(`${base}/orders/${declinedId}/close`, 'POST', {
      expectedTotal: 16420,
      payment: { method: 'digitalGateway', payerReference: 'rechazo@pasarela.test' },
    });
    expect(declined.status).toBe(402);
    expect(await declined.json()).toMatchObject({ code: 'PaymentDeclinedError' });

    const outageId = await readyOrderLViaHttp(base, '6');
    const outage = await send(`${base}/orders/${outageId}/close`, 'POST', {
      expectedTotal: 16420,
      payment: { method: 'digitalGateway', payerReference: 'caida@pasarela.test' },
    });
    expect(outage.status).toBe(503);
    expect(await outage.json()).toMatchObject({ code: 'PaymentProcessorUnavailableError' });
  });

  it('rejects insufficient cash with 422 (H51)', async () => {
    const { base } = await listen();
    const orderId = await readyOrderLViaHttp(base);

    const response = await send(`${base}/orders/${orderId}/close`, 'POST', {
      expectedTotal: 16420,
      payment: { method: 'cash', tendered: 16000 },
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: 'InsufficientCashError' });
  });

  it('rejects malformed close bodies with 400 (H52)', async () => {
    const { base } = await listen();
    const orderId = await readyOrderLViaHttp(base);

    const bodies = [
      {},
      { expectedTotal: 16420, payment: { method: 'cash', tendered: 20000 }, extra: true },
      { expectedTotal: 16420, payment: { method: 'coupon', tendered: 20000 } },
      { expectedTotal: 16420, payment: { method: 'cash', tendered: '200' } },
      { expectedTotal: 16420, payment: { method: 'card', cardLast4: 4242 } },
      { payment: { method: 'cash', tendered: 20000 } },
      { expectedTotal: {}, payment: { method: 'cash', tendered: 20000 } },
      { expectedTotal: 16420, payment: null },
    ];

    for (const body of bodies) {
      const response = await send(`${base}/orders/${orderId}/close`, 'POST', body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'InvalidRequest' });
    }
  });

  it('rejects out-of-range payment fields with 422 (H53)', async () => {
    const { base } = await listen();
    const orderId = await readyOrderLViaHttp(base);

    const cases = [
      {
        body: { expectedTotal: 16420, payment: { method: 'card', cardLast4: '12' } },
        code: 'InvalidCardLast4Error',
      },
      {
        body: {
          expectedTotal: 16420,
          payment: { method: 'digitalGateway', payerReference: 'ab' },
        },
        code: 'InvalidPayerReferenceError',
      },
      {
        body: { expectedTotal: 16420, payment: { method: 'cash', tendered: -1 } },
        code: 'InvalidMoneyError',
      },
      {
        body: { expectedTotal: 1.5, payment: { method: 'cash', tendered: 20000 } },
        code: 'InvalidMoneyError',
      },
    ] as const;

    for (const entry of cases) {
      const response = await send(`${base}/orders/${orderId}/close`, 'POST', entry.body);
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ code: entry.code });
    }
  });

  it('rejects close outside READY with 409 (H54)', async () => {
    const { base } = await listen();

    const openId = await (async () => {
      const opened = await send(`${base}/orders`, 'POST', { tableId: '5' });
      const order = await opened.json();
      await send(`${base}/orders/${order.id}/lines`, 'POST', {
        menuItemId: TACOS_ID,
        quantity: 2,
        modifierIds: [QUESO_ID],
      });
      await send(`${base}/orders/${order.id}/lines`, 'POST', {
        menuItemId: AGUA_ID,
        quantity: 1,
        modifierIds: [],
      });
      return order.id as string;
    })();

    const sent = await send(`${base}/orders`, 'POST', { tableId: '6' });
    const sentOrder = await sent.json();
    await send(`${base}/orders/${sentOrder.id}/lines`, 'POST', {
      menuItemId: TACOS_ID,
      quantity: 2,
      modifierIds: [QUESO_ID],
    });
    await send(`${base}/orders/${sentOrder.id}/lines`, 'POST', {
      menuItemId: AGUA_ID,
      quantity: 1,
      modifierIds: [],
    });
    await send(`${base}/orders/${sentOrder.id}/send-to-kitchen`, 'POST', {});

    const cooking = await send(`${base}/orders`, 'POST', { tableId: '7' });
    const cookingOrder = await cooking.json();
    await send(`${base}/orders/${cookingOrder.id}/lines`, 'POST', {
      menuItemId: TACOS_ID,
      quantity: 2,
      modifierIds: [QUESO_ID],
    });
    await send(`${base}/orders/${cookingOrder.id}/lines`, 'POST', {
      menuItemId: AGUA_ID,
      quantity: 1,
      modifierIds: [],
    });
    await send(`${base}/orders/${cookingOrder.id}/send-to-kitchen`, 'POST', {});
    await send(`${base}/orders/${cookingOrder.id}/begin-cooking`, 'POST', {});

    const cancelled = await send(`${base}/orders`, 'POST', { tableId: '8' });
    const cancelledOrder = await cancelled.json();
    await send(`${base}/orders/${cancelledOrder.id}/cancel`, 'POST', {});

    for (const orderId of [openId, sentOrder.id, cookingOrder.id, cancelledOrder.id]) {
      const response = await send(`${base}/orders/${orderId}/close`, 'POST', cashClose);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'OrderNotClosableError' });
    }
  });

  it('rejects stale expectedTotal after tip (H55)', async () => {
    const { base } = await listen();
    const orderId = await readyOrderLViaHttp(base);

    const tip = await send(`${base}/orders/${orderId}/tip`, 'PUT', {
      tip: { kind: 'percentage', basisPoints: 1000 },
    });
    expect(tip.status).toBe(200);

    const close = await send(`${base}/orders/${orderId}/close`, 'POST', cashClose);
    expect(close.status).toBe(409);
    expect(await close.json()).toMatchObject({ code: 'PaymentAmountMismatchError' });

    const totals = await send(`${base}/orders/${orderId}/totals`, 'GET');
    expect(totals.status).toBe(200);
    expect((await totals.json()).total).toEqual({ amount: 17870, currency: 'MXN' });

    const order = await send(`${base}/orders/${orderId}`, 'GET');
    expect((await order.json()).status).toBe('READY');
  });

  it('rejects a second close (H56)', async () => {
    const { base } = await listen();
    const orderId = await readyOrderLViaHttp(base);

    const first = await send(`${base}/orders/${orderId}/close`, 'POST', cashClose);
    expect(first.status).toBe(200);

    const second = await send(`${base}/orders/${orderId}/close`, 'POST', cashClose);
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ code: 'OrderNotClosableError' });
  });

  it('returns 404 for a missing order close (H57)', async () => {
    const { base } = await listen();
    const response = await send(`${base}/orders/no-existe/close`, 'POST', cashClose);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'OrderNotFoundError' });
  });

  it('returns the same payment payload on GET (H58)', async () => {
    const { base } = await listen();
    const orderId = await readyOrderLViaHttp(base);

    const closed = await send(`${base}/orders/${orderId}/close`, 'POST', cashClose);
    const closedBody = await closed.json();

    const payment = await send(`${base}/orders/${orderId}/payment`, 'GET');
    expect(payment.status).toBe(200);
    expect(await payment.json()).toEqual(closedBody);
    assertProductVocabulary(closedBody);
  });

  it('returns 404 when payment or order is missing (H59)', async () => {
    const { base } = await listen();
    const orderId = await readyOrderLViaHttp(base);

    const ready = await send(`${base}/orders/${orderId}/payment`, 'GET');
    expect(ready.status).toBe(404);
    expect(await ready.json()).toMatchObject({ code: 'PaymentNotFoundError' });

    const missing = await send(`${base}/orders/no-existe/payment`, 'GET');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: 'OrderNotFoundError' });
  });

  it('blocks edits after close and keeps totals readable (H60)', async () => {
    const { base } = await listen();
    const orderId = await readyOrderLViaHttp(base);
    await send(`${base}/orders/${orderId}/close`, 'POST', cashClose);

    const line = await send(`${base}/orders/${orderId}/lines`, 'POST', {
      menuItemId: AGUA_ID,
      quantity: 1,
      modifierIds: [],
    });
    expect(line.status).toBe(409);
    expect(await line.json()).toMatchObject({ code: 'OrderNotEditableError' });

    const tip = await send(`${base}/orders/${orderId}/tip`, 'PUT', {
      tip: { kind: 'percentage', basisPoints: 1000 },
    });
    expect(tip.status).toBe(409);
    expect(await tip.json()).toMatchObject({ code: 'OrderTotalsNotAdjustableError' });

    const cancel = await send(`${base}/orders/${orderId}/cancel`, 'POST', {});
    expect(cancel.status).toBe(409);
    expect(await cancel.json()).toMatchObject({ code: 'InvalidOrderTransitionError' });

    const totals = await send(`${base}/orders/${orderId}/totals`, 'GET');
    expect(totals.status).toBe(200);
    const body = await totals.json();
    expect(body.adjustable).toBe(false);
    expect(body.total).toEqual({ amount: 16420, currency: 'MXN' });
  });

  it('keeps order JSON without payment and updates allowedActions (H61)', async () => {
    const { base } = await listen();
    const orderId = await readyOrderLViaHttp(base);

    const ready = await send(`${base}/orders/${orderId}`, 'GET');
    const readyBody = await ready.json();
    expect(readyBody.allowedActions).toEqual(['close']);
    expect(readyBody).not.toHaveProperty('payment');
    expect(Object.keys(readyBody).sort()).toEqual(
      ['allowedActions', 'externalOrderId', 'id', 'lines', 'openedAt', 'status', 'tableId'].sort(),
    );

    await send(`${base}/orders/${orderId}/close`, 'POST', cashClose);
    const closed = await send(`${base}/orders/${orderId}`, 'GET');
    const closedBody = await closed.json();
    expect(closedBody.allowedActions).toEqual([]);
    expect(closedBody).not.toHaveProperty('payment');
    expect(Object.keys(closedBody).sort()).toEqual(
      ['allowedActions', 'externalOrderId', 'id', 'lines', 'openedAt', 'status', 'tableId'].sort(),
    );
  });

  it('voids after a concurrent save (H62)', async () => {
    const tracked = new InMemoryOrderRepository();
    await tracked.add(readyOrderL());
    const concurrent = withConcurrentSave(tracked, (order) =>
      order.setTip(Tip.percentage(Percentage.of(1000))),
    );
    const cash = new FakePaymentPort('cash').approveWith('cash-ref');
    const ports = [
      cash,
      new FakePaymentPort('card'),
      new FakePaymentPort('digitalGateway'),
    ];
    const seen = watchOrders(concurrent);
    const { base } = await listen({
      orders: seen.orders,
      track: tracked,
      payments: ports,
    });

    const response = await send(`${base}/orders/order-1/close`, 'POST', cashClose);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'OrderConcurrencyError' });
    expect(cash.voids).toEqual(['cash-ref']);
  });

  it('returns 500 when save and void both fail (H63)', async () => {
    const tracked = new InMemoryOrderRepository();
    await tracked.add(readyOrderL());
    const boom = new Error('boom');
    const failing: OrderRepository = {
      add: (order) => tracked.add(order),
      findById: (id) => tracked.findById(id),
      findByExternalOrderId: (id) => tracked.findByExternalOrderId(id),
      findActiveByTableId: (tableId) => tracked.findActiveByTableId(tableId),
      list: (filter) => tracked.list(filter),
      async save() {
        throw boom;
      },
    };
    const cash = new FakePaymentPort('cash').approveWith('cash-ref').failVoid();
    const ports = [
      cash,
      new FakePaymentPort('card'),
      new FakePaymentPort('digitalGateway'),
    ];
    const { base } = await listen({ orders: failing, track: tracked, payments: ports });

    const response = await send(`${base}/orders/order-1/close`, 'POST', cashClose);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: 'PaymentVoidFailedError' });
  });

  it('does not charge or save on validation failures (H64)', async () => {
    const cash = new FakePaymentPort('cash').approveWith('cash-ref');
    const card = new FakePaymentPort('card').approveWith('card-ref');
    const gateway = new FakePaymentPort('digitalGateway').approveWith('gw-ref');
    const ports = [cash, card, gateway];
    const { base, calls } = await listen({ payments: ports });

    const readyId = await readyOrderLViaHttp(base);
    const chargeCount = () =>
      cash.charges.length + card.charges.length + gateway.charges.length;

    async function expectFailingClose(
      orderId: string,
      body: unknown,
      status: number,
    ): Promise<void> {
      const savesBefore = calls.save;
      const chargesBefore = chargeCount();
      const response = await send(`${base}/orders/${orderId}/close`, 'POST', body);
      expect(response.status).toBe(status);
      expect(chargeCount()).toBe(chargesBefore);
      expect(calls.save).toBe(savesBefore);
    }

    await expectFailingClose(
      readyId,
      { expectedTotal: 16420, payment: { method: 'cash', tendered: 16000 } },
      422,
    );
    await expectFailingClose(readyId, {}, 400);
    await expectFailingClose(
      readyId,
      { expectedTotal: 16420, payment: { method: 'card', cardLast4: '12' } },
      422,
    );

    const open = await send(`${base}/orders`, 'POST', { tableId: '9' });
    const openOrder = await open.json();
    await send(`${base}/orders/${openOrder.id}/lines`, 'POST', {
      menuItemId: TACOS_ID,
      quantity: 1,
      modifierIds: [],
    });
    await expectFailingClose(openOrder.id, cashClose, 409);

    await send(`${base}/orders/${readyId}/tip`, 'PUT', {
      tip: { kind: 'percentage', basisPoints: 1000 },
    });
    await expectFailingClose(readyId, cashClose, 409);
    await expectFailingClose('no-existe', cashClose, 404);

    expect(chargeCount()).toBe(0);

    await send(`${base}/orders/${readyId}/tip`, 'PUT', { tip: null });
    const firstClose = await send(`${base}/orders/${readyId}/close`, 'POST', cashClose);
    expect(firstClose.status).toBe(200);
    expect(chargeCount()).toBe(1);

    const savesAfterClose = calls.save;
    const secondClose = await send(`${base}/orders/${readyId}/close`, 'POST', cashClose);
    expect(secondClose.status).toBe(409);
    expect(chargeCount()).toBe(1);
    expect(calls.save).toBe(savesAfterClose);
  });

  it('rejects bodies that include orderId (H65)', async () => {
    const { base } = await listen();
    const orderId = await readyOrderLViaHttp(base);

    const response = await send(`${base}/orders/${orderId}/close`, 'POST', {
      ...cashClose,
      orderId,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'InvalidRequest' });
  });

  it('leaves unknown errors without a domain code (H66)', async () => {
    const tracked = new InMemoryOrderRepository();
    await tracked.add(readyOrderL());
    const failing: OrderRepository = {
      add: (order) => tracked.add(order),
      findById: async () => {
        throw new Error('unexpected');
      },
      findByExternalOrderId: (id) => tracked.findByExternalOrderId(id),
      findActiveByTableId: (tableId) => tracked.findActiveByTableId(tableId),
      list: (filter) => tracked.list(filter),
      save: (order) => tracked.save(order),
    };
    const { base } = await listen({ orders: failing, track: tracked });

    const response = await send(`${base}/orders/order-1/close`, 'POST', cashClose);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).not.toHaveProperty('code');
  });

  it('lists CLOSED orders after close (H67)', async () => {
    const { base } = await listen();
    const orderId = await readyOrderLViaHttp(base);
    await send(`${base}/orders/${orderId}/close`, 'POST', cashClose);

    const response = await send(`${base}/orders?status=CLOSED`, 'GET');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: orderId, status: 'CLOSED' })]),
    );
  });

  it('never exposes persistence vocabulary in payment responses (H68)', async () => {
    const { base } = await listen();
    const orderId = await readyOrderLViaHttp(base);

    const closed = await send(`${base}/orders/${orderId}/close`, 'POST', cashClose);
    assertProductVocabulary(await closed.json());

    const payment = await send(`${base}/orders/${orderId}/payment`, 'GET');
    assertProductVocabulary(await payment.json());

    const declined = await send(`${base}/orders`, 'POST', { tableId: '10' });
    const other = await declined.json();
    await send(`${base}/orders/${other.id}/lines`, 'POST', {
      menuItemId: TACOS_ID,
      quantity: 2,
      modifierIds: [QUESO_ID],
    });
    await send(`${base}/orders/${other.id}/lines`, 'POST', {
      menuItemId: AGUA_ID,
      quantity: 1,
      modifierIds: [],
    });
    for (const action of ['send-to-kitchen', 'begin-cooking', 'mark-ready'] as const) {
      await send(`${base}/orders/${other.id}/${action}`, 'POST', {});
    }
    const decline = await send(`${base}/orders/${other.id}/close`, 'POST', {
      expectedTotal: 16420,
      payment: { method: 'card', cardLast4: '0002' },
    });
    assertProductVocabulary(await decline.json());
  });
});

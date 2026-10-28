import { eq, sql } from 'drizzle-orm';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CloseOrder } from '../../application/payment/close-order';
import type { OrderRepository } from '../../application/ports/order-repository';
import { Ingredient } from '../../domain/menu/ingredient';
import { MenuItem } from '../../domain/menu/menu-item';
import { TaxRate } from '../../domain/menu/tax-rate';
import { Money } from '../../domain/money/money';
import { LineItem } from '../../domain/order/line-item';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import { Quantity } from '../../domain/order/quantity';
import { type AppDatabase, createDatabase } from '../persistence/drizzle/client';
import { DrizzleOrderRepository } from '../persistence/drizzle/drizzle-order-repository';
import { orders } from '../persistence/drizzle/schema/order';
import { GrpcPaymentAdapter, createPaymentGrpcCaller } from './grpc-payment-adapter';

const integrationOn = process.env.PAYMENTS_GRPC_INTEGRATION === '1';

if (integrationOn && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}
if (integrationOn && !process.env.PAYMENTS_GRPC_URL) {
  throw new Error('PAYMENTS_GRPC_URL is required');
}

const describeIntegration = integrationOn ? describe : describe.skip;
const OPENED_AT = new Date('2026-10-28T18:00:00.000Z');

describeIntegration('payment gRPC across processes', () => {
  let client: Sql;
  let paymentsClient: Sql;
  let db: AppDatabase;
  const created: { orderId: string; menuItemId: string }[] = [];

  beforeAll(() => {
    const databaseUrl = process.env.DATABASE_URL;
    const paymentsGrpcUrl = process.env.PAYMENTS_GRPC_URL;
    if (!databaseUrl || !paymentsGrpcUrl) {
      throw new Error('DATABASE_URL and PAYMENTS_GRPC_URL are required');
    }
    const opened = createDatabase(databaseUrl);
    client = opened.client;
    db = opened.db;
    paymentsClient = postgres(paymentsDatabaseUrl(), { max: 1 });
  });

  afterEach(async () => {
    for (const row of created) {
      await db.delete(orders).where(eq(orders.id, row.orderId));
      await paymentsClient`delete from payments where subject_id = ${row.orderId}`;
    }
    created.length = 0;
  });

  afterAll(async () => {
    await client.end({ timeout: 1 });
    await paymentsClient.end({ timeout: 1 });
  });

  it('closes with cash through the real adapter and stores the receipt pointer (P2-8)', async () => {
    const orderId = id();
    const menuItemId = id();
    created.push({ orderId, menuItemId });
    const ordersRepo = new DrizzleOrderRepository(db, receiptQuery());
    const ready = await seedReady(ordersRepo, orderId, menuItemId);
    const total = ready.totals().total.amount;

    const closed = await closeOrder(ordersRepo).execute({
      orderId,
      expectedTotal: total,
      payment: { method: 'cash', tendered: total },
    });

    expect(closed.order.status).toBe('CLOSED');
    expect(closed.payment.change?.amount).toBe(0);

    const stored = await db
      .select({ paymentId: orders.paymentId, paymentReference: orders.paymentReference, status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId));
    const receipt = await paymentsClient<
      { paymentId: string; reference: string; status: string; subjectId: string }[]
    >`
      select payment_id as "paymentId", reference, status, subject_id as "subjectId"
      from payments
      where subject_id = ${orderId} and status = 'approved'
    `;

    expect(receipt).toHaveLength(1);
    expect(stored[0]?.status).toBe('CLOSED');
    expect(stored[0]?.paymentId).toBe(receipt[0]?.paymentId);
    expect(stored[0]?.paymentReference).toBe(receipt[0]?.reference);
    expect(closed.payment.id).toBe(receipt[0]?.paymentId);
    expect(closed.payment.reference).toBe(receipt[0]?.reference);

    const oldTable = await db.execute(sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_name = 'order_payments'
    `);
    expect(oldTable).toHaveLength(0);
  });

  it('voids the charge and leaves the order READY when save fails (P2-9)', async () => {
    const orderId = id();
    const menuItemId = id();
    created.push({ orderId, menuItemId });
    const ordersRepo = new DrizzleOrderRepository(db, receiptQuery());
    const ready = await seedReady(ordersRepo, orderId, menuItemId);
    const boom = new Error('save failed');
    const failing: OrderRepository = {
      add: (order) => ordersRepo.add(order),
      findById: (orderIdToFind) => ordersRepo.findById(orderIdToFind),
      findByExternalOrderId: (externalOrderId) => ordersRepo.findByExternalOrderId(externalOrderId),
      findActiveByTableId: (tableId) => ordersRepo.findActiveByTableId(tableId),
      listActiveByTableId: (tableId) => ordersRepo.listActiveByTableId(tableId),
      listBySittingId: (sittingId) => ordersRepo.listBySittingId(sittingId),
      list: (filter) => ordersRepo.list(filter),
      async save() {
        throw boom;
      },
    };

    await expect(
      closeOrder(failing).execute({
        orderId,
        expectedTotal: ready.totals().total.amount,
        payment: { method: 'cash', tendered: ready.totals().total.amount },
      }),
    ).rejects.toBe(boom);

    const stored = await ordersRepo.findById(orderId);
    expect(stored?.status).toBe('READY');
    expect(stored?.payment).toBeNull();

    const rows = await paymentsClient<{ status: string }[]>`
      select status from payments where subject_id = ${orderId}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('voided');
  });
});

function closeOrder(orders: OrderRepository): CloseOrder {
  const paymentsGrpcUrl = process.env.PAYMENTS_GRPC_URL;
  if (!paymentsGrpcUrl) {
    throw new Error('PAYMENTS_GRPC_URL is required');
  }
  const caller = createPaymentGrpcCaller(paymentsGrpcUrl);
  return new CloseOrder(
    orders,
    [
      new GrpcPaymentAdapter(caller, 'cash'),
      new GrpcPaymentAdapter(caller, 'card'),
      new GrpcPaymentAdapter(caller, 'digitalGateway'),
    ],
    () => crypto.randomUUID(),
    () => new Date(),
  );
}

function receiptQuery() {
  const paymentsGrpcUrl = process.env.PAYMENTS_GRPC_URL;
  if (!paymentsGrpcUrl) {
    throw new Error('PAYMENTS_GRPC_URL is required');
  }
  return new GrpcPaymentAdapter(createPaymentGrpcCaller(paymentsGrpcUrl), 'cash');
}

async function seedReady(
  ordersRepo: DrizzleOrderRepository,
  orderId: string,
  menuItemId: string,
): Promise<Order> {
  const dish = MenuItem.create({
    id: menuItemId,
    name: 'Plato P2',
    price: Money.of(1000, 'MXN'),
    applicableTax: TaxRate.of(0),
    ingredients: [Ingredient.of({ id: `ing-${menuItemId}`, name: 'Masa' })],
    modifiers: [],
  });
  await ordersRepo.add(
    Order.open({
      id: orderId,
      origin: OrderOrigin.table(`p2-${orderId.slice(0, 8)}`),
      openedAt: OPENED_AT,
    }),
  );
  let order = (await ordersRepo.findById(orderId))!;
  order = order.addLine(
    LineItem.capture({
      id: id(),
      menuItem: dish,
      quantity: Quantity.of(1),
      modifierIds: [],
    }),
  );
  await ordersRepo.save(order);
  order = (await ordersRepo.findById(orderId))!;
  await ordersRepo.save(order.sendToKitchen());
  order = (await ordersRepo.findById(orderId))!;
  await ordersRepo.save(order.beginCooking());
  order = (await ordersRepo.findById(orderId))!;
  await ordersRepo.save(order.markReady());
  return (await ordersRepo.findById(orderId))!;
}

function paymentsDatabaseUrl(): string {
  if (process.env.PAYMENTS_DATABASE_URL) {
    return process.env.PAYMENTS_DATABASE_URL;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to read payment receipts');
  }
  const url = new URL(databaseUrl);
  url.pathname = '/payments';
  return url.toString();
}

function id(): string {
  return crypto.randomUUID();
}

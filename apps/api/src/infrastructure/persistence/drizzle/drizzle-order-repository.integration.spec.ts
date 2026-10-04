import { asc, eq, sql } from 'drizzle-orm';
import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ExternalOrderIdInUseError,
  OrderAlreadyExistsError,
  OrderConcurrencyError,
  OrderMappingError,
  OrderNotFoundError,
} from '../../../application/order/order-repository.errors';
import { Ingredient } from '../../../domain/menu/ingredient';
import { MenuItem } from '../../../domain/menu/menu-item';
import { Modifier } from '../../../domain/menu/modifier';
import { TaxRate } from '../../../domain/menu/tax-rate';
import { Money } from '../../../domain/money/money';
import { LineItem } from '../../../domain/order/line-item';
import { Order } from '../../../domain/order/order';
import { OrderOrigin } from '../../../domain/order/order-origin';
import { Quantity } from '../../../domain/order/quantity';
import { type AppDatabase, createDatabase } from './client';
import { DrizzleMenuRepository, type MenuDatabase } from './drizzle-menu-repository';
import { DrizzleOrderRepository, type OrderDatabase } from './drizzle-order-repository';
import { orderLineModifiers, orderLines, orders } from './schema/order';

const integrationOn = process.env.ORDER_REPOSITORY_INTEGRATION === '1';

if (integrationOn && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const describeIntegration = integrationOn ? describe : describe.skip;

const OPENED_AT = new Date('2026-10-04T18:00:00.000Z');

describeIntegration('DrizzleOrderRepository', () => {
  let client: Sql;
  let db: AppDatabase;

  beforeAll(() => {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is required');
    }

    const opened = createDatabase(url);
    client = opened.client;
    db = opened.db;
  });

  afterAll(async () => {
    await client.end();
  });

  it('adds a table order without lines and reads it back at version 0 (P1)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo) => {
      const order = Order.open({
        id: orderId,
        origin: OrderOrigin.table('5'),
        openedAt: OPENED_AT,
      });

      await ordersRepo.add(order);
      const found = await ordersRepo.findById(orderId);

      expect(found).not.toBeNull();
      expect(found?.status).toBe('OPEN');
      expect(found?.origin.tableId).toBe('5');
      expect(found?.origin.externalOrderId).toBeNull();
      expect(found?.openedAt.getTime()).toBe(OPENED_AT.getTime());
      expect(found?.version).toBe(0);
      expect(found?.lines).toHaveLength(0);
    });
  });

  it('adds an external order and reads the inverted origin (P2)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo) => {
      const order = Order.open({
        id: orderId,
        origin: OrderOrigin.external('UBER-1'),
        openedAt: OPENED_AT,
      });

      await ordersRepo.add(order);
      const found = await ordersRepo.findById(orderId);

      expect(found?.origin.tableId).toBeNull();
      expect(found?.origin.externalOrderId).toBe('UBER-1');
      expect(found?.status).toBe('OPEN');
      expect(found?.version).toBe(0);
      expect(found?.openedAt.getTime()).toBe(OPENED_AT.getTime());
    });
  });

  it('saves two lines with extra and exclusion and bumps version (P3)', async () => {
    const orderId = id();
    const menuItemId = id();
    const quesoId = id();
    const cilantroId = id();

    await inTransaction(db, async (ordersRepo, menuRepo) => {
      const dish = tacosDish(menuItemId, quesoId, cilantroId);
      await menuRepo.add(dish);

      await ordersRepo.add(
        Order.open({ id: orderId, origin: OrderOrigin.table('7'), openedAt: OPENED_AT }),
      );

      const first = await ordersRepo.findById(orderId);
      expect(first).not.toBeNull();

      const withLines = first!
        .addLine(
          LineItem.capture({
            id: id(),
            menuItem: dish,
            quantity: Quantity.of(1),
            modifierIds: [],
          }),
        )
        .addLine(
          LineItem.capture({
            id: id(),
            menuItem: dish,
            quantity: Quantity.of(2),
            modifierIds: [quesoId, cilantroId],
          }),
        );

      await ordersRepo.save(withLines);
      const found = await ordersRepo.findById(orderId);

      expect(found?.version).toBe(1);
      expect(found?.lines).toHaveLength(2);
      expect(found?.lines[0]?.quantity.amount).toBe(1);
      expect(found?.lines[0]?.modifiers).toHaveLength(0);
      expect(found?.lines[1]?.quantity.amount).toBe(2);
      expect(found?.lines[1]?.unitPrice.amount).toBe(4500);
      expect(found?.lines[1]?.applicableTax.basisPoints).toBe(1600);
      expect(found?.lines[1]?.modifiers).toHaveLength(2);
      expect(found?.lines[1]?.modifiers[0]?.name).toBe('Queso');
      expect(found?.lines[1]?.modifiers[0]?.price?.amount).toBe(1500);
      expect(found?.lines[1]?.modifiers[1]?.name).toBe('Cilantro');
      expect(found?.lines[1]?.modifiers[1]?.price).toBeNull();
    });
  });

  it('removes the first line on save and leaves no orphan modifiers (P4)', async () => {
    const orderId = id();
    const menuItemId = id();
    const quesoId = id();
    const cilantroId = id();
    const lineKeep = id();
    const lineDrop = id();

    await inTransaction(db, async (ordersRepo, menuRepo, tx) => {
      const dish = tacosDish(menuItemId, quesoId, cilantroId);
      await menuRepo.add(dish);

      await ordersRepo.add(
        Order.open({ id: orderId, origin: OrderOrigin.table('8'), openedAt: OPENED_AT }),
      );
      const opened = await ordersRepo.findById(orderId);
      expect(opened).not.toBeNull();

      await ordersRepo.save(
        opened!
          .addLine(
            LineItem.capture({
              id: lineDrop,
              menuItem: dish,
              quantity: Quantity.of(1),
              modifierIds: [quesoId],
            }),
          )
          .addLine(
            LineItem.capture({
              id: lineKeep,
              menuItem: dish,
              quantity: Quantity.of(2),
              modifierIds: [cilantroId],
            }),
          ),
      );

      const withTwo = await ordersRepo.findById(orderId);
      expect(withTwo).not.toBeNull();
      await ordersRepo.save(withTwo!.cancelLine(lineDrop));

      const found = await ordersRepo.findById(orderId);
      expect(found?.lines).toHaveLength(1);
      expect(found?.lines[0]?.id).toBe(lineKeep);

      const orphanModifiers = await tx
        .select()
        .from(orderLineModifiers)
        .where(eq(orderLineModifiers.orderLineId, lineDrop));
      expect(orphanModifiers).toHaveLength(0);
    });
  });

  it('rejects a stale save and keeps the first write (P5)', async () => {
    const orderId = id();
    const menuItemId = id();

    await inTransaction(db, async (ordersRepo, menuRepo) => {
      const dish = tacosDish(menuItemId);
      await menuRepo.add(dish);
      await ordersRepo.add(
        Order.open({ id: orderId, origin: OrderOrigin.table('9'), openedAt: OPENED_AT }),
      );

      const first = await ordersRepo.findById(orderId);
      const second = await ordersRepo.findById(orderId);
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();

      await ordersRepo.save(
        first!.addLine(
          LineItem.capture({
            id: id(),
            menuItem: dish,
            quantity: Quantity.of(1),
            modifierIds: [],
          }),
        ),
      );

      await expect(
        ordersRepo.save(
          second!.addLine(
            LineItem.capture({
              id: id(),
              menuItem: dish,
              quantity: Quantity.of(2),
              modifierIds: [],
            }),
          ),
        ),
      ).rejects.toBeInstanceOf(OrderConcurrencyError);

      const stored = await ordersRepo.findById(orderId);
      expect(stored?.version).toBe(1);
      expect(stored?.lines).toHaveLength(1);
      expect(stored?.lines[0]?.quantity.amount).toBe(1);
    });
  });

  it('rejects save of a missing id and inserts no lines (P6)', async () => {
    const orderId = id();
    const menuItemId = id();
    const lineId = id();

    await inTransaction(db, async (ordersRepo, menuRepo, tx) => {
      const dish = tacosDish(menuItemId);
      await menuRepo.add(dish);

      const missing = Order.open({
        id: orderId,
        origin: OrderOrigin.table('10'),
        openedAt: OPENED_AT,
      }).addLine(
        LineItem.capture({
          id: lineId,
          menuItem: dish,
          quantity: Quantity.of(1),
          modifierIds: [],
        }),
      );

      await expect(ordersRepo.save(missing)).rejects.toBeInstanceOf(OrderNotFoundError);

      const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, orderId));
      expect(lines).toHaveLength(0);
    });
  });

  it('rejects a second add with the same id (P7)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo) => {
      await ordersRepo.add(
        Order.open({ id: orderId, origin: OrderOrigin.table('11'), openedAt: OPENED_AT }),
      );

      await expect(
        ordersRepo.add(
          Order.open({ id: orderId, origin: OrderOrigin.table('12'), openedAt: OPENED_AT }),
        ),
      ).rejects.toBeInstanceOf(OrderAlreadyExistsError);
    });
  });

  it('keeps two OPEN orders on the same table and lists both (P8)', async () => {
    const firstId = id();
    const secondId = id();
    const tableId = `t-${id().slice(0, 8)}`;

    await inTransaction(db, async (ordersRepo) => {
      await ordersRepo.add(
        Order.open({ id: firstId, origin: OrderOrigin.table(tableId), openedAt: OPENED_AT }),
      );
      await ordersRepo.add(
        Order.open({
          id: secondId,
          origin: OrderOrigin.table(tableId),
          openedAt: new Date('2026-10-04T18:01:00.000Z'),
        }),
      );

      const listed = await ordersRepo.list({ statuses: ['OPEN'] });
      const ids = listed.map((order) => order.id);

      expect(ids).toContain(firstId);
      expect(ids).toContain(secondId);
      expect(listed.filter((order) => order.origin.tableId === tableId)).toHaveLength(2);
    });
  });

  it('rejects a repeated externalOrderId on direct add (P9)', async () => {
    const external = `EXT-${id()}`;

    await inTransaction(db, async (ordersRepo) => {
      await ordersRepo.add(
        Order.open({
          id: id(),
          origin: OrderOrigin.external(external),
          openedAt: OPENED_AT,
        }),
      );

      await expect(
        ordersRepo.add(
          Order.open({
            id: id(),
            origin: OrderOrigin.external(external),
            openedAt: OPENED_AT,
          }),
        ),
      ).rejects.toBeInstanceOf(ExternalOrderIdInUseError);
    });
  });

  it('rejects a repeated externalOrderId even when the first is CANCELLED (P10)', async () => {
    const external = `EXT-${id()}`;

    await inTransaction(db, async (ordersRepo) => {
      const firstId = id();
      await ordersRepo.add(
        Order.open({
          id: firstId,
          origin: OrderOrigin.external(external),
          openedAt: OPENED_AT,
        }),
      );
      const opened = await ordersRepo.findById(firstId);
      expect(opened).not.toBeNull();
      await ordersRepo.save(opened!.cancel());

      await expect(
        ordersRepo.add(
          Order.open({
            id: id(),
            origin: OrderOrigin.external(external),
            openedAt: OPENED_AT,
          }),
        ),
      ).rejects.toBeInstanceOf(ExternalOrderIdInUseError);
    });
  });

  it('keeps captured line prices after the menu dish changes (P11)', async () => {
    const orderId = id();
    const menuItemId = id();
    const quesoId = id();
    const cilantroId = id();

    await inTransaction(db, async (ordersRepo, menuRepo) => {
      const dish = tacosDish(menuItemId, quesoId, cilantroId);
      await menuRepo.add(dish);

      await ordersRepo.add(
        Order.open({ id: orderId, origin: OrderOrigin.table('13'), openedAt: OPENED_AT }),
      );
      const opened = await ordersRepo.findById(orderId);
      expect(opened).not.toBeNull();
      await ordersRepo.save(
        opened!.addLine(
          LineItem.capture({
            id: id(),
            menuItem: dish,
            quantity: Quantity.of(2),
            modifierIds: [quesoId, cilantroId],
          }),
        ),
      );

      await menuRepo.save(
        MenuItem.restore({
          id: menuItemId,
          name: 'Tacos nuevos',
          price: Money.of(9900, 'MXN'),
          applicableTax: TaxRate.of(1600),
          active: true,
          ingredients: [Ingredient.of({ id: id(), name: 'Cebolla' })],
          modifiers: [
            Modifier.extra({ id: id(), name: 'Salsa', price: Money.of(300, 'MXN') }),
            Modifier.exclusion({ id: id(), name: 'Cebolla' }),
          ],
        }),
      );

      const found = await ordersRepo.findById(orderId);
      expect(found?.lines[0]?.name).toBe('Tacos');
      expect(found?.lines[0]?.unitPrice.amount).toBe(4500);
      expect(found?.lines[0]?.modifiers).toHaveLength(2);
      expect(found?.lines[0]?.modifiers[0]?.name).toBe('Queso');
      expect(found?.lines[0]?.modifiers[0]?.price?.amount).toBe(1500);
      expect(found?.lines[0]?.modifiers[1]?.name).toBe('Cilantro');
      expect(found?.lines[0]?.modifiers[1]?.price).toBeNull();
    });
  });

  it('filters list by status and orders by opened_at then id (P12)', async () => {
    const suffix = id();
    const kitchenEarly = `a-${suffix}`;
    const kitchenLate = `b-${suffix}`;
    const openId = `c-${suffix}`;

    await inTransaction(db, async (ordersRepo, menuRepo) => {
      const dish = tacosDish(id());
      await menuRepo.add(dish);

      await ordersRepo.add(
        Order.open({
          id: kitchenLate,
          origin: OrderOrigin.table('14'),
          openedAt: new Date('2026-10-04T18:02:00.000Z'),
        }),
      );
      await ordersRepo.add(
        Order.open({
          id: kitchenEarly,
          origin: OrderOrigin.table('15'),
          openedAt: new Date('2026-10-04T18:01:00.000Z'),
        }),
      );
      await ordersRepo.add(
        Order.open({
          id: openId,
          origin: OrderOrigin.table('16'),
          openedAt: new Date('2026-10-04T18:00:00.000Z'),
        }),
      );

      for (const orderId of [kitchenEarly, kitchenLate]) {
        const current = await ordersRepo.findById(orderId);
        expect(current).not.toBeNull();
        await ordersRepo.save(
          current!
            .addLine(
              LineItem.capture({
                id: id(),
                menuItem: dish,
                quantity: Quantity.of(1),
                modifierIds: [],
              }),
            )
            .startCooking(),
        );
      }

      const kitchenIds = (await ordersRepo.list({ statuses: ['IN_KITCHEN'] }))
        .map((order) => order.id)
        .filter((orderId) => orderId === kitchenEarly || orderId === kitchenLate);
      expect(kitchenIds).toEqual([kitchenEarly, kitchenLate]);

      const allIds = (await ordersRepo.list({ statuses: null }))
        .map((order) => order.id)
        .filter(
          (orderId) =>
            orderId === openId || orderId === kitchenEarly || orderId === kitchenLate,
        );
      expect(allIds).toEqual([openId, kitchenEarly, kitchenLate]);
    });
  });

  it('rejects COOKING by check and maps USD currency to OrderMappingError (P13)', async () => {
    const cookingId = id();
    const usdOrderId = id();
    const usdLineId = id();
    const menuItemId = id();

    await inTransaction(db, async (ordersRepo, menuRepo, tx) => {
      await menuRepo.add(tacosDish(menuItemId));

      await expectCheckViolation(tx, async () => {
        await tx.insert(orders).values({
          id: cookingId,
          tableId: '17',
          externalOrderId: null,
          status: 'COOKING',
          openedAt: OPENED_AT,
          version: 0,
        });
      });

      await tx.insert(orders).values({
        id: usdOrderId,
        tableId: '18',
        externalOrderId: null,
        status: 'OPEN',
        openedAt: OPENED_AT,
        version: 0,
      });
      await tx.insert(orderLines).values({
        id: usdLineId,
        orderId: usdOrderId,
        menuItemId,
        name: 'Tacos',
        unitPriceAmount: 4500,
        unitPriceCurrency: 'USD',
        taxBasisPoints: 1600,
        quantity: 1,
        position: 0,
      });

      await expect(ordersRepo.findById(usdOrderId)).rejects.toBeInstanceOf(OrderMappingError);
    });
  });

  it('stores modifier prices by kind and rejects quantity 0 and 100 (P14)', async () => {
    const orderId = id();
    const menuItemId = id();
    const quesoId = id();
    const cilantroId = id();
    const lineId = id();

    await inTransaction(db, async (ordersRepo, menuRepo, tx) => {
      const dish = tacosDish(menuItemId, quesoId, cilantroId);
      await menuRepo.add(dish);

      await ordersRepo.add(
        Order.open({ id: orderId, origin: OrderOrigin.table('19'), openedAt: OPENED_AT }),
      );
      const opened = await ordersRepo.findById(orderId);
      expect(opened).not.toBeNull();
      await ordersRepo.save(
        opened!.addLine(
          LineItem.capture({
            id: lineId,
            menuItem: dish,
            quantity: Quantity.of(1),
            modifierIds: [quesoId, cilantroId],
          }),
        ),
      );

      const rows = await tx
        .select()
        .from(orderLineModifiers)
        .where(eq(orderLineModifiers.orderLineId, lineId))
        .orderBy(asc(orderLineModifiers.position));

      expect(rows[0]?.kind).toBe('extra');
      expect(rows[0]?.priceAmount).toBe(1500);
      expect(rows[0]?.priceCurrency).toBe('MXN');
      expect(rows[1]?.kind).toBe('exclusion');
      expect(rows[1]?.priceAmount).toBeNull();
      expect(rows[1]?.priceCurrency).toBeNull();

      await expectCheckViolation(tx, async () => {
        await tx.insert(orderLines).values({
          id: id(),
          orderId,
          menuItemId,
          name: 'Tacos',
          unitPriceAmount: 4500,
          unitPriceCurrency: 'MXN',
          taxBasisPoints: 1600,
          quantity: 0,
          position: 1,
        });
      });

      await expectCheckViolation(tx, async () => {
        await tx.insert(orderLines).values({
          id: id(),
          orderId,
          menuItemId,
          name: 'Tacos',
          unitPriceAmount: 4500,
          unitPriceCurrency: 'MXN',
          taxBasisPoints: 1600,
          quantity: 100,
          position: 1,
        });
      });
    });
  });
});

class RollbackSignal extends Error {
  constructor() {
    super('rollback');
    this.name = 'RollbackSignal';
  }
}

async function inTransaction(
  db: AppDatabase,
  run: (
    orders: DrizzleOrderRepository,
    menu: DrizzleMenuRepository,
    tx: OrderDatabase & MenuDatabase,
  ) => Promise<void>,
): Promise<void> {
  let failure: unknown;

  try {
    await db.transaction(async (tx) => {
      const ordersRepo = new DrizzleOrderRepository(tx);
      const menuRepo = new DrizzleMenuRepository(tx);
      try {
        await run(ordersRepo, menuRepo, tx);
      } catch (error) {
        failure = error;
      }
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      throw error;
    }
  }

  if (failure) {
    throw failure;
  }
}

function tacosDish(
  menuItemId: string,
  quesoId = id(),
  cilantroId = id(),
): MenuItem {
  return MenuItem.create({
    id: menuItemId,
    name: 'Tacos',
    price: Money.of(4500, 'MXN'),
    applicableTax: TaxRate.of(1600),
    ingredients: [
      Ingredient.of({ id: `ing-cilantro-${cilantroId}`, name: 'Cilantro' }),
    ],
    modifiers: [
      Modifier.extra({ id: quesoId, name: 'Queso', price: Money.of(1500, 'MXN') }),
      Modifier.exclusion({ id: cilantroId, name: 'Cilantro' }),
    ],
  });
}

function id(): string {
  return crypto.randomUUID();
}

async function expectCheckViolation(
  tx: OrderDatabase,
  run: () => Promise<void>,
): Promise<void> {
  const savepoint = `sp_${id().replaceAll('-', '')}`;
  await tx.execute(sql.raw(`savepoint ${savepoint}`));

  try {
    await run();
    throw new Error('expected check violation');
  } catch (error) {
    if (error instanceof Error && error.message === 'expected check violation') {
      throw error;
    }
    expect(postgresCode(error)).toBe('23514');
    await tx.execute(sql.raw(`rollback to savepoint ${savepoint}`));
  }
}

function postgresCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null) {
    if ('code' in error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) {
      return error.code;
    }
    if ('cause' in error) {
      return postgresCode(error.cause);
    }
  }

  if (error instanceof postgres.PostgresError) {
    return error.code;
  }

  return undefined;
}

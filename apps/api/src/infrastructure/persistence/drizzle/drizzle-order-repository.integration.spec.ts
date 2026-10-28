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
import { ChargeRequest } from '../../../domain/payment/charge-request';
import { PaymentDetails } from '../../../domain/payment/payment-details';
import { Payment } from '../../../domain/payment/payment';
import { Discount } from '../../../domain/totals/discount';
import { Percentage } from '../../../domain/totals/percentage';
import { Tip } from '../../../domain/totals/tip';
import { type AppDatabase, createDatabase } from './client';
import { DrizzleMenuRepository, type MenuDatabase } from './drizzle-menu-repository';
import { DrizzleOrderRepository, type OrderDatabase } from './drizzle-order-repository';
import { orderLineModifiers, orderLines, orderPayments, orders } from './schema/order';

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
            .sendToKitchen(),
        );
      }

      const kitchenIds = (await ordersRepo.list({ statuses: ['SENT_TO_KITCHEN'] }))
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

  it('adds a new order with null adjustment columns (P15)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo, _menu, tx) => {
      await ordersRepo.add(
        Order.open({ id: orderId, origin: OrderOrigin.table('20'), openedAt: OPENED_AT }),
      );

      const found = await ordersRepo.findById(orderId);
      expect(found?.discount).toBeNull();
      expect(found?.tip).toBeNull();

      const rows = await tx.select().from(orders).where(eq(orders.id, orderId));
      expect(rows[0]?.discountKind).toBeNull();
      expect(rows[0]?.discountBasisPoints).toBeNull();
      expect(rows[0]?.discountAmount).toBeNull();
      expect(rows[0]?.discountCurrency).toBeNull();
      expect(rows[0]?.tipKind).toBeNull();
      expect(rows[0]?.tipBasisPoints).toBeNull();
      expect(rows[0]?.tipAmount).toBeNull();
      expect(rows[0]?.tipCurrency).toBeNull();
    });
  });

  it('saves percentage discount and fixed tip and reads them back (P16)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo) => {
      await ordersRepo.add(
        Order.open({ id: orderId, origin: OrderOrigin.table('21'), openedAt: OPENED_AT }),
      );
      const opened = await ordersRepo.findById(orderId);
      expect(opened).not.toBeNull();

      await ordersRepo.save(
        opened!
          .setDiscount(Discount.percentage(Percentage.of(1000)))
          .setTip(Tip.fixedAmount(Money.of(2000, 'MXN'))),
      );

      const found = await ordersRepo.findById(orderId);
      expect(found?.version).toBe(1);
      expect(found?.discount?.kind).toBe('percentage');
      expect(found?.discount?.amountFor(Money.of(14500, 'MXN')).amount).toBe(1450);
      expect(found?.tip?.kind).toBe('fixedAmount');
      expect(found?.tip?.amountFor(Money.zero('MXN')).amount).toBe(2000);
    });
  });

  it('clears discount and tip on save (P17)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo, _menu, tx) => {
      await ordersRepo.add(
        Order.open({ id: orderId, origin: OrderOrigin.table('22'), openedAt: OPENED_AT })
          .setDiscount(Discount.percentage(Percentage.of(1000)))
          .setTip(Tip.percentage(Percentage.of(1500))),
      );
      const stored = await ordersRepo.findById(orderId);
      expect(stored).not.toBeNull();

      await ordersRepo.save(stored!.setDiscount(null).setTip(null));
      const found = await ordersRepo.findById(orderId);

      expect(found?.discount).toBeNull();
      expect(found?.tip).toBeNull();
      const rows = await tx.select().from(orders).where(eq(orders.id, orderId));
      expect(rows[0]?.discountKind).toBeNull();
      expect(rows[0]?.tipKind).toBeNull();
    });
  });

  it('keeps discount when saving only tip (P18)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo) => {
      await ordersRepo.add(
        Order.open({ id: orderId, origin: OrderOrigin.table('23'), openedAt: OPENED_AT }).setDiscount(
          Discount.fixedAmount(Money.of(5000, 'MXN')),
        ),
      );
      const withDiscount = await ordersRepo.findById(orderId);
      expect(withDiscount).not.toBeNull();

      await ordersRepo.save(withDiscount!.setTip(Tip.percentage(Percentage.of(1000))));
      const found = await ordersRepo.findById(orderId);

      expect(found?.discount?.kind).toBe('fixedAmount');
      expect(found?.discount?.amountFor(Money.of(14500, 'MXN')).amount).toBe(5000);
      expect(found?.tip?.kind).toBe('percentage');
    });
  });

  it('rejects a concurrent tip save and keeps the first write (P19)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo) => {
      await ordersRepo.add(
        Order.open({ id: orderId, origin: OrderOrigin.table('24'), openedAt: OPENED_AT }),
      );

      const first = await ordersRepo.findById(orderId);
      const second = await ordersRepo.findById(orderId);
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();

      await ordersRepo.save(first!.setTip(Tip.percentage(Percentage.of(1000))));
      await expect(
        ordersRepo.save(second!.setTip(Tip.percentage(Percentage.of(1500)))),
      ).rejects.toBeInstanceOf(OrderConcurrencyError);

      const stored = await ordersRepo.findById(orderId);
      expect(stored?.tip?.kind).toBe('percentage');
      expect(stored?.tip?.amountFor(Money.of(14500, 'MXN')).amount).toBe(1450);
    });
  });

  it('rejects invalid discount column combinations by check (P20)', async () => {
    await inTransaction(db, async (_orders, _menu, tx) => {
      const base = {
        tableId: '25',
        externalOrderId: null as string | null,
        status: 'OPEN',
        openedAt: OPENED_AT,
        version: 0,
      };

      await expectCheckViolation(tx, async () => {
        await tx.insert(orders).values({
          ...base,
          id: id(),
          discountKind: 'coupon',
        });
      });

      for (const basisPoints of [0, 10001]) {
        await expectCheckViolation(tx, async () => {
          await tx.insert(orders).values({
            ...base,
            id: id(),
            discountKind: 'percentage',
            discountBasisPoints: basisPoints,
          });
        });
      }

      await expectCheckViolation(tx, async () => {
        await tx.insert(orders).values({
          ...base,
          id: id(),
          discountKind: 'percentage',
          discountBasisPoints: 1000,
          discountAmount: 5000,
        });
      });

      await expectCheckViolation(tx, async () => {
        await tx.insert(orders).values({
          ...base,
          id: id(),
          discountKind: 'fixedAmount',
          discountAmount: 0,
          discountCurrency: 'MXN',
        });
      });

      await expectCheckViolation(tx, async () => {
        await tx.insert(orders).values({
          ...base,
          id: id(),
          discountKind: 'fixedAmount',
          discountAmount: 5000,
          discountCurrency: null,
        });
      });
    });
  });

  it('rejects invalid tip column combinations by check (P21)', async () => {
    await inTransaction(db, async (_orders, _menu, tx) => {
      const base = {
        tableId: '26',
        externalOrderId: null as string | null,
        status: 'OPEN',
        openedAt: OPENED_AT,
        version: 0,
      };

      await expectCheckViolation(tx, async () => {
        await tx.insert(orders).values({
          ...base,
          id: id(),
          tipKind: 'coupon',
        });
      });

      for (const basisPoints of [0, 10001]) {
        await expectCheckViolation(tx, async () => {
          await tx.insert(orders).values({
            ...base,
            id: id(),
            tipKind: 'percentage',
            tipBasisPoints: basisPoints,
          });
        });
      }

      await expectCheckViolation(tx, async () => {
        await tx.insert(orders).values({
          ...base,
          id: id(),
          tipKind: 'percentage',
          tipBasisPoints: 1000,
          tipAmount: 5000,
        });
      });

      await expectCheckViolation(tx, async () => {
        await tx.insert(orders).values({
          ...base,
          id: id(),
          tipKind: 'fixedAmount',
          tipAmount: 0,
          tipCurrency: 'MXN',
        });
      });

      await expectCheckViolation(tx, async () => {
        await tx.insert(orders).values({
          ...base,
          id: id(),
          tipKind: 'fixedAmount',
          tipAmount: 5000,
          tipCurrency: null,
        });
      });
    });
  });

  it('maps USD discount currency to OrderMappingError (P22)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo, _menu, tx) => {
      await tx.insert(orders).values({
        id: orderId,
        tableId: '27',
        externalOrderId: null,
        status: 'OPEN',
        openedAt: OPENED_AT,
        version: 0,
        discountKind: 'fixedAmount',
        discountBasisPoints: null,
        discountAmount: 5000,
        discountCurrency: 'USD',
      });

      await expect(ordersRepo.findById(orderId)).rejects.toBeInstanceOf(OrderMappingError);
    });
  });

  it('adds a new order without a payment row (P23)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo, _menu, tx) => {
      await ordersRepo.add(
        Order.open({ id: orderId, origin: OrderOrigin.table('30'), openedAt: OPENED_AT }),
      );

      const found = await ordersRepo.findById(orderId);
      expect(found?.payment).toBeNull();

      const rows = await tx.select().from(orderPayments).where(eq(orderPayments.orderId, orderId));
      expect(rows).toHaveLength(0);
    });
  });

  it('saves a closed cash payment and reads it back (P24)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo, menuRepo, tx) => {
      const ready = await seedReadyOrderL(ordersRepo, menuRepo, orderId);
      const payment = cashPayment(orderId);
      await ordersRepo.save(ready.close(payment));

      const found = await ordersRepo.findById(orderId);
      expect(found?.status).toBe('CLOSED');
      expect(found?.payment?.id).toBe(payment.id);
      expect(found?.payment?.method).toBe('cash');
      expect(found?.payment?.amount.amount).toBe(16420);
      expect(found?.payment?.details).toEqual(payment.details);
      expect(found?.payment?.reference).toBe(payment.reference);
      expect(found?.payment?.paidAt.getTime()).toBe(OPENED_AT.getTime());
      expect(found?.payment?.change?.amount).toBe(3580);

      const rows = await tx.select().from(orderPayments).where(eq(orderPayments.orderId, orderId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tenderedAmount).toBe(20000);
      expect(rows[0]?.cardLast4).toBeNull();
      expect(rows[0]?.payerReference).toBeNull();
    });
  });

  it('saves a closed card payment (P25)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo, menuRepo, tx) => {
      const ready = await seedReadyOrderL(ordersRepo, menuRepo, orderId);
      const payment = cardPayment(orderId, '4242');
      await ordersRepo.save(ready.close(payment));

      const found = await ordersRepo.findById(orderId);
      expect(found?.payment?.method).toBe('card');
      if (found?.payment?.details.method === 'card') {
        expect(found.payment.details.cardLast4).toBe('4242');
      }

      const rows = await tx.select().from(orderPayments).where(eq(orderPayments.orderId, orderId));
      expect(rows[0]?.cardLast4).toBe('4242');
      expect(rows[0]?.tenderedAmount).toBeNull();
      expect(rows[0]?.payerReference).toBeNull();
    });
  });

  it('saves a closed gateway payment (P26)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo, menuRepo, tx) => {
      const ready = await seedReadyOrderL(ordersRepo, menuRepo, orderId);
      const payment = gatewayPayment(orderId, 'cliente@correo.mx');
      await ordersRepo.save(ready.close(payment));

      const found = await ordersRepo.findById(orderId);
      if (found?.payment?.details.method === 'digitalGateway') {
        expect(found.payment.details.payerReference).toBe('cliente@correo.mx');
      }

      const rows = await tx.select().from(orderPayments).where(eq(orderPayments.orderId, orderId));
      expect(rows[0]?.payerReference).toBe('cliente@correo.mx');
      expect(rows[0]?.tenderedAmount).toBeNull();
      expect(rows[0]?.cardLast4).toBeNull();
    });
  });

  it('rejects a concurrent close and keeps the cash payment (P27)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo, menuRepo, tx) => {
      await seedReadyOrderL(ordersRepo, menuRepo, orderId);
      const first = await ordersRepo.findById(orderId);
      const second = await ordersRepo.findById(orderId);
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();

      await ordersRepo.save(first!.close(cashPayment(orderId, 16420, 20000, 'pay-cash')));
      await expect(
        ordersRepo.save(second!.close(cardPayment(orderId, '4242', 'pay-card'))),
      ).rejects.toBeInstanceOf(OrderConcurrencyError);

      const rows = await tx.select().from(orderPayments).where(eq(orderPayments.orderId, orderId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.method).toBe('cash');
      expect(rows[0]?.paymentId).toBe('pay-cash');
    });
  });

  it('rolls back close when payment_id already exists (P28)', async () => {
    const orderId = id();
    const otherId = id();
    const sharedPaymentId = id();

    await inTransaction(db, async (ordersRepo, menuRepo, tx) => {
      const ready = await seedReadyOrderL(ordersRepo, menuRepo, orderId);
      const other = await seedReadyOrderL(ordersRepo, menuRepo, otherId);
      await ordersRepo.save(other.close(cashPayment(otherId, 16420, 20000, sharedPaymentId)));

      const versionBefore = ready.version;
      await expect(
        ordersRepo.save(ready.close(cashPayment(orderId, 16420, 20000, sharedPaymentId))),
      ).rejects.toBeTruthy();

      const found = await ordersRepo.findById(orderId);
      expect(found?.status).toBe('READY');
      expect(found?.payment).toBeNull();
      expect(found?.version).toBe(versionBefore);
      expect(found?.lines).toHaveLength(2);

      const rows = await tx.select().from(orderPayments).where(eq(orderPayments.orderId, orderId));
      expect(rows).toHaveLength(0);
    });
  });

  it('rejects invalid payment shapes by check (P29)', async () => {
    await inTransaction(db, async (ordersRepo, menuRepo, tx) => {
      const orderId = id();
      await seedReadyOrderL(ordersRepo, menuRepo, orderId);

      const base = {
        orderId,
        paymentId: id(),
        amount: 16420,
        currency: 'MXN',
        reference: 'ref-1',
        paidAt: OPENED_AT,
      };

      await expectCheckViolation(tx, async () => {
        await tx.insert(orderPayments).values({ ...base, method: 'coupon' });
      });
      await expectCheckViolation(tx, async () => {
        await tx.insert(orderPayments).values({
          ...base,
          paymentId: id(),
          method: 'cash',
          tenderedAmount: null,
        });
      });
      await expectCheckViolation(tx, async () => {
        await tx.insert(orderPayments).values({
          ...base,
          paymentId: id(),
          method: 'cash',
          tenderedAmount: 16000,
        });
      });
      await expectCheckViolation(tx, async () => {
        await tx.insert(orderPayments).values({
          ...base,
          paymentId: id(),
          method: 'card',
          cardLast4: null,
        });
      });
      await expectCheckViolation(tx, async () => {
        await tx.insert(orderPayments).values({
          ...base,
          paymentId: id(),
          method: 'card',
          cardLast4: '12a4',
        });
      });
      await expectCheckViolation(tx, async () => {
        await tx.insert(orderPayments).values({
          ...base,
          paymentId: id(),
          method: 'card',
          cardLast4: '4242',
          tenderedAmount: 20000,
        });
      });
      await expectCheckViolation(tx, async () => {
        await tx.insert(orderPayments).values({
          ...base,
          paymentId: id(),
          method: 'digitalGateway',
          payerReference: null,
        });
      });
      await expectCheckViolation(tx, async () => {
        await tx.insert(orderPayments).values({
          ...base,
          paymentId: id(),
          method: 'digitalGateway',
          payerReference: 'ab',
        });
      });
      await expectCheckViolation(tx, async () => {
        await tx.insert(orderPayments).values({
          ...base,
          paymentId: id(),
          method: 'digitalGateway',
          payerReference: 'cliente@correo.mx',
          cardLast4: '4242',
        });
      });
      await expectCheckViolation(tx, async () => {
        await tx.insert(orderPayments).values({
          ...base,
          paymentId: id(),
          method: 'cash',
          tenderedAmount: 20000,
          reference: '',
        });
      });
      await expectCheckViolation(tx, async () => {
        await tx.insert(orderPayments).values({
          ...base,
          paymentId: id(),
          method: 'cash',
          tenderedAmount: 0,
          amount: -1,
        });
      });
    });
  });

  it('enforces payment FK and cascades delete (P30)', async () => {
    await inTransaction(db, async (ordersRepo, menuRepo, tx) => {
      const orderId = id();
      await seedReadyOrderL(ordersRepo, menuRepo, orderId);

      await expectFkViolation(tx, async () => {
        await tx.insert(orderPayments).values({
          orderId: id(),
          paymentId: id(),
          method: 'cash',
          amount: 16420,
          currency: 'MXN',
          tenderedAmount: 20000,
          reference: 'ref-1',
          paidAt: OPENED_AT,
        });
      });

      const ready = await ordersRepo.findById(orderId);
      expect(ready).not.toBeNull();
      await ordersRepo.save(ready!.close(cashPayment(orderId)));
      expect(
        (await tx.select().from(orderPayments).where(eq(orderPayments.orderId, orderId))).length,
      ).toBe(1);

      await tx.delete(orders).where(eq(orders.id, orderId));
      expect(
        (await tx.select().from(orderPayments).where(eq(orderPayments.orderId, orderId))).length,
      ).toBe(0);
    });
  });

  it('rejects broken CLOSED/payment invariants on read (P31)', async () => {
    await inTransaction(db, async (ordersRepo, menuRepo, tx) => {
      const closedId = id();
      await seedReadyOrderL(ordersRepo, menuRepo, closedId);
      await tx
        .update(orders)
        .set({ status: 'CLOSED', version: 10 })
        .where(eq(orders.id, closedId));
      await expect(ordersRepo.findById(closedId)).rejects.toBeInstanceOf(OrderMappingError);

      const readyId = id();
      await seedReadyOrderL(ordersRepo, menuRepo, readyId);
      await tx.insert(orderPayments).values({
        orderId: readyId,
        paymentId: id(),
        method: 'cash',
        amount: 16420,
        currency: 'MXN',
        tenderedAmount: 20000,
        reference: 'ref-ready',
        paidAt: OPENED_AT,
      });
      await expect(ordersRepo.findById(readyId)).rejects.toBeInstanceOf(OrderMappingError);

      const mismatchId = id();
      const ready = await seedReadyOrderL(ordersRepo, menuRepo, mismatchId);
      await ordersRepo.save(ready.close(cashPayment(mismatchId)));
      await tx
        .update(orderPayments)
        .set({ amount: 16000, tenderedAmount: 20000 })
        .where(eq(orderPayments.orderId, mismatchId));
      await expect(ordersRepo.findById(mismatchId)).rejects.toBeInstanceOf(OrderMappingError);
    });
  });

  it('lists closed orders with their payments in one batch (P32)', async () => {
    await inTransaction(db, async (ordersRepo, menuRepo) => {
      const firstId = id();
      const secondId = id();
      const thirdId = id();

      await ordersRepo.save(
        (await seedReadyOrderL(ordersRepo, menuRepo, firstId)).close(
          cashPayment(firstId, 16420, 20000, 'pay-1'),
        ),
      );
      await ordersRepo.save(
        (await seedReadyOrderL(ordersRepo, menuRepo, secondId)).close(
          cardPayment(secondId, '4242', 'pay-2'),
        ),
      );
      await ordersRepo.save(
        (await seedReadyOrderL(ordersRepo, menuRepo, thirdId)).close(
          gatewayPayment(thirdId, 'cliente@correo.mx', 'pay-3'),
        ),
      );

      const listed = await ordersRepo.list({ statuses: ['CLOSED'] });
      const byId = new Map(listed.map((order) => [order.id, order]));

      expect(byId.get(firstId)?.payment?.id).toBe('pay-1');
      expect(byId.get(secondId)?.payment?.id).toBe('pay-2');
      expect(byId.get(thirdId)?.payment?.id).toBe('pay-3');
      expect(byId.get(firstId)?.payment?.method).toBe('cash');
      expect(byId.get(secondId)?.payment?.method).toBe('card');
      expect(byId.get(thirdId)?.payment?.method).toBe('digitalGateway');
    });
  });

  it('rejects USD payment currency on read (P33)', async () => {
    await inTransaction(db, async (ordersRepo, menuRepo, tx) => {
      const orderId = id();
      const ready = await seedReadyOrderL(ordersRepo, menuRepo, orderId);
      await ordersRepo.save(ready.close(cashPayment(orderId)));
      await tx
        .update(orderPayments)
        .set({ currency: 'USD' })
        .where(eq(orderPayments.orderId, orderId));

      await expect(ordersRepo.findById(orderId)).rejects.toBeInstanceOf(OrderMappingError);
    });
  });

  it('finds an OPEN order by table id (P34)', async () => {
    const orderId = id();
    const tableId = `fa-${id().slice(0, 8)}`;

    await inTransaction(db, async (ordersRepo) => {
      await ordersRepo.add(
        Order.open({ id: orderId, origin: OrderOrigin.table(tableId), openedAt: OPENED_AT }),
      );

      const found = await ordersRepo.findActiveByTableId(tableId);

      expect(found?.id).toBe(orderId);
      expect(found?.status).toBe('OPEN');
      expect(found?.origin.tableId).toBe(tableId);
      await expect(ordersRepo.findActiveByTableId('no-such-table')).resolves.toBeNull();
    });
  });

  it('does not treat CLOSED or CANCELLED as active for a table (P35)', async () => {
    const closedId = id();
    const cancelledId = id();
    const tableClosed = `fc-${id().slice(0, 8)}`;
    const tableCancelled = `fx-${id().slice(0, 8)}`;

    await inTransaction(db, async (ordersRepo, menuRepo) => {
      await ordersRepo.add(
        Order.open({
          id: cancelledId,
          origin: OrderOrigin.table(tableCancelled),
          openedAt: OPENED_AT,
        }),
      );
      const opened = await ordersRepo.findById(cancelledId);
      await ordersRepo.save(opened!.cancel());

      const ready = await seedReadyOrderL(ordersRepo, menuRepo, closedId, tableClosed);
      await ordersRepo.save(ready.close(cashPayment(closedId)));

      await expect(ordersRepo.findActiveByTableId(tableCancelled)).resolves.toBeNull();
      await expect(ordersRepo.findActiveByTableId(tableClosed)).resolves.toBeNull();
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

function aguaDish(menuItemId: string): MenuItem {
  return MenuItem.create({
    id: menuItemId,
    name: 'Agua de jamaica',
    price: Money.of(2500, 'MXN'),
    applicableTax: TaxRate.of(0),
    ingredients: [Ingredient.of({ id: `ing-azucar-${menuItemId}`, name: 'Azúcar' })],
    modifiers: [],
  });
}

async function seedReadyOrderL(
  ordersRepo: DrizzleOrderRepository,
  menuRepo: DrizzleMenuRepository,
  orderId: string,
  tableId = '5',
): Promise<Order> {
  const tacosId = id();
  const quesoId = id();
  const cilantroId = id();
  const aguaId = id();
  const tacos = tacosDish(tacosId, quesoId, cilantroId);
  const agua = aguaDish(aguaId);
  await menuRepo.add(tacos);
  await menuRepo.add(agua);

  await ordersRepo.add(
    Order.open({ id: orderId, origin: OrderOrigin.table(tableId), openedAt: OPENED_AT }),
  );
  let order = (await ordersRepo.findById(orderId))!;
  order = order
    .addLine(
      LineItem.capture({
        id: id(),
        menuItem: tacos,
        quantity: Quantity.of(2),
        modifierIds: [quesoId],
      }),
    )
    .addLine(
      LineItem.capture({
        id: id(),
        menuItem: agua,
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

function cashPayment(
  orderId: string,
  amount = 16420,
  tendered = 20000,
  paymentId = id(),
): Payment {
  return Payment.record({
    id: paymentId,
    request: ChargeRequest.of({
      orderId,
      amount: Money.of(amount, 'MXN'),
      details: PaymentDetails.cash(Money.of(tendered, 'MXN')),
    }),
    reference: 'cash-1',
    paidAt: OPENED_AT,
  });
}

function cardPayment(orderId: string, cardLast4: string, paymentId = id()): Payment {
  return Payment.record({
    id: paymentId,
    request: ChargeRequest.of({
      orderId,
      amount: Money.of(16420, 'MXN'),
      details: PaymentDetails.card(cardLast4),
    }),
    reference: 'card-1',
    paidAt: OPENED_AT,
  });
}

function gatewayPayment(
  orderId: string,
  payerReference: string,
  paymentId = id(),
): Payment {
  return Payment.record({
    id: paymentId,
    request: ChargeRequest.of({
      orderId,
      amount: Money.of(16420, 'MXN'),
      details: PaymentDetails.digitalGateway(payerReference),
    }),
    reference: 'gw-1',
    paidAt: OPENED_AT,
  });
}

function id(): string {
  return crypto.randomUUID();
}

async function expectCheckViolation(
  tx: OrderDatabase,
  run: () => Promise<void>,
): Promise<void> {
  await expectPostgresCode(tx, run, '23514');
}

async function expectFkViolation(
  tx: OrderDatabase,
  run: () => Promise<void>,
): Promise<void> {
  await expectPostgresCode(tx, run, '23503');
}

async function expectPostgresCode(
  tx: OrderDatabase,
  run: () => Promise<void>,
  code: string,
): Promise<void> {
  const savepoint = `sp_${id().replaceAll('-', '')}`;
  await tx.execute(sql.raw(`savepoint ${savepoint}`));

  try {
    await run();
    throw new Error(`expected postgres code ${code}`);
  } catch (error) {
    if (error instanceof Error && error.message === `expected postgres code ${code}`) {
      throw error;
    }
    expect(postgresCode(error)).toBe(code);
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

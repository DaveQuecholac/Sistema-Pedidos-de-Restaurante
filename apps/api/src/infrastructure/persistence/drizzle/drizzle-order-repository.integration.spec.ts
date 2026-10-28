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
import type { PaymentReceiptQuery } from '../../../application/ports/payment-receipt-query';
import { type AppDatabase, createDatabase } from './client';
import { DrizzleMenuRepository, type MenuDatabase } from './drizzle-menu-repository';
import { DrizzleOrderRepository, type OrderDatabase } from './drizzle-order-repository';
import { menuItems } from './schema/menu';
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

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is required');
    }

    const opened = createDatabase(url);
    client = opened.client;
    db = opened.db;
    seededReceipts = await loadApprovedReceipts();
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

  it('adds a new order without a payment pointer (P23)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo, _menu, tx) => {
      await ordersRepo.add(
        Order.open({ id: orderId, origin: OrderOrigin.table('30'), openedAt: OPENED_AT }),
      );

      const found = await ordersRepo.findById(orderId);
      expect(found?.payment).toBeNull();

      const rows = await tx
        .select({ paymentId: orders.paymentId, paymentReference: orders.paymentReference })
        .from(orders)
        .where(eq(orders.id, orderId));
      expect(rows[0]).toEqual({ paymentId: null, paymentReference: null });
    });
  });

  it('saves a closed cash payment and reads it back (P24)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo, menuRepo, tx, receipts) => {
      const ready = await seedReadyOrderL(ordersRepo, menuRepo, orderId);
      const payment = cashPayment(orderId);
      await ordersRepo.save(ready.close(payment));
      receipts.put(orderId, payment);

      const found = await ordersRepo.findById(orderId);
      expect(found?.status).toBe('CLOSED');
      expect(found?.payment?.id).toBe(payment.id);
      expect(found?.payment?.method).toBe('cash');
      expect(found?.payment?.amount.amount).toBe(16420);
      expect(found?.payment?.details).toEqual(payment.details);
      expect(found?.payment?.reference).toBe(payment.reference);
      expect(found?.payment?.paidAt.getTime()).toBe(OPENED_AT.getTime());
      expect(found?.payment?.change?.amount).toBe(3580);

      const rows = await tx
        .select({ paymentId: orders.paymentId, paymentReference: orders.paymentReference })
        .from(orders)
        .where(eq(orders.id, orderId));
      expect(rows[0]).toEqual({ paymentId: payment.id, paymentReference: payment.reference });
    });
  });

  it('saves a closed card payment (P25)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo, menuRepo, tx, receipts) => {
      const ready = await seedReadyOrderL(ordersRepo, menuRepo, orderId);
      const payment = cardPayment(orderId, '4242');
      await ordersRepo.save(ready.close(payment));
      receipts.put(orderId, payment);

      const found = await ordersRepo.findById(orderId);
      expect(found?.payment?.method).toBe('card');
      if (found?.payment?.details.method === 'card') {
        expect(found.payment.details.cardLast4).toBe('4242');
      }

      const rows = await tx
        .select({ paymentId: orders.paymentId, paymentReference: orders.paymentReference })
        .from(orders)
        .where(eq(orders.id, orderId));
      expect(rows[0]).toEqual({ paymentId: payment.id, paymentReference: payment.reference });
    });
  });

  it('saves a closed gateway payment (P26)', async () => {
    const orderId = id();

    await inTransaction(db, async (ordersRepo, menuRepo, tx, receipts) => {
      const ready = await seedReadyOrderL(ordersRepo, menuRepo, orderId);
      const payment = gatewayPayment(orderId, 'cliente@correo.mx');
      await ordersRepo.save(ready.close(payment));
      receipts.put(orderId, payment);

      const found = await ordersRepo.findById(orderId);
      if (found?.payment?.details.method === 'digitalGateway') {
        expect(found.payment.details.payerReference).toBe('cliente@correo.mx');
      }

      const rows = await tx
        .select({ paymentId: orders.paymentId, paymentReference: orders.paymentReference })
        .from(orders)
        .where(eq(orders.id, orderId));
      expect(rows[0]).toEqual({ paymentId: payment.id, paymentReference: payment.reference });
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

      const payment = cashPayment(orderId, 16420, 20000, 'pay-cash');
      await ordersRepo.save(first!.close(payment));
      await expect(
        ordersRepo.save(second!.close(cardPayment(orderId, '4242', 'pay-card'))),
      ).rejects.toBeInstanceOf(OrderConcurrencyError);

      const rows = await tx
        .select({ paymentId: orders.paymentId, paymentReference: orders.paymentReference })
        .from(orders)
        .where(eq(orders.id, orderId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ paymentId: 'pay-cash', paymentReference: payment.reference });
    });
  });

  it('persists payment pointers without a payment table (P28)', async () => {
    const orderId = id();
    const otherId = id();

    await inTransaction(db, async (ordersRepo, menuRepo, tx, receipts) => {
      const ready = await seedReadyOrderL(ordersRepo, menuRepo, orderId);
      const other = await seedReadyOrderL(ordersRepo, menuRepo, otherId);
      const payment = cashPayment(orderId);
      const otherPayment = cashPayment(otherId);
      await ordersRepo.save(ready.close(payment));
      await ordersRepo.save(other.close(otherPayment));
      receipts.put(orderId, payment);
      receipts.put(otherId, otherPayment);

      const rows = await tx
        .select({ paymentId: orders.paymentId, paymentReference: orders.paymentReference })
        .from(orders)
        .where(eq(orders.id, orderId));
      expect(rows[0]).toEqual({ paymentId: payment.id, paymentReference: payment.reference });

      const tables = await tx.execute(sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'order_payments'
      `);
      expect(tables).toHaveLength(0);

      const found = await ordersRepo.findById(orderId);
      expect(found?.payment?.id).toBe(payment.id);
      expect(found?.payment?.method).toBe('cash');
      expect(found?.payment?.change?.amount).toBe(3580);
    });
  });

  it('rejects a half-written payment pointer and a settled order with its own payment (P29)', async () => {
    await inTransaction(db, async (ordersRepo, menuRepo, tx) => {
      const orderId = id();
      await seedReadyOrderL(ordersRepo, menuRepo, orderId);

      await expectCheckViolation(tx, async () => {
        await tx
          .update(orders)
          .set({ paymentId: 'pay', paymentReference: null })
          .where(eq(orders.id, orderId));
      });
      await expectCheckViolation(tx, async () => {
        await tx
          .update(orders)
          .set({ paymentId: null, paymentReference: 'ref' })
          .where(eq(orders.id, orderId));
      });
      await expectCheckViolation(tx, async () => {
        await tx
          .update(orders)
          .set({ paymentId: ' ', paymentReference: 'ref' })
          .where(eq(orders.id, orderId));
      });
      await expectCheckViolation(tx, async () => {
        await tx
          .update(orders)
          .set({
            tableSettlementId: id(),
            paymentId: 'pay',
            paymentReference: 'ref',
          })
          .where(eq(orders.id, orderId));
      });
    });
  });

  it('deletes an order that only stores a payment pointer (P30)', async () => {
    await inTransaction(db, async (ordersRepo, menuRepo, tx) => {
      const orderId = id();
      const ready = await seedReadyOrderL(ordersRepo, menuRepo, orderId);
      const payment = cashPayment(orderId);
      await ordersRepo.save(ready.close(payment));

      const before = await tx
        .select({ paymentId: orders.paymentId })
        .from(orders)
        .where(eq(orders.id, orderId));
      expect(before[0]?.paymentId).toBe(payment.id);

      await tx.delete(orders).where(eq(orders.id, orderId));
      const after = await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId));
      expect(after).toHaveLength(0);
    });
  });

  it('rejects broken CLOSED/payment invariants on read (P31)', async () => {
    await inTransaction(db, async (ordersRepo, menuRepo, tx, receipts) => {
      const closedId = id();
      await seedReadyOrderL(ordersRepo, menuRepo, closedId);
      await tx
        .update(orders)
        .set({ status: 'CLOSED', version: 10 })
        .where(eq(orders.id, closedId));
      await expect(ordersRepo.findById(closedId)).rejects.toBeInstanceOf(OrderMappingError);

      const readyId = id();
      await seedReadyOrderL(ordersRepo, menuRepo, readyId);
      const readyPayment = cashPayment(readyId);
      await tx
        .update(orders)
        .set({ paymentId: readyPayment.id, paymentReference: readyPayment.reference })
        .where(eq(orders.id, readyId));
      receipts.put(readyId, readyPayment);
      await expect(ordersRepo.findById(readyId)).rejects.toBeInstanceOf(OrderMappingError);

      const mismatchId = id();
      const ready = await seedReadyOrderL(ordersRepo, menuRepo, mismatchId);
      const payment = cashPayment(mismatchId);
      await ordersRepo.save(ready.close(payment));
      receipts.put(mismatchId, cashPayment(mismatchId, 16000, 20000, payment.id));
      await expect(ordersRepo.findById(mismatchId)).rejects.toBeInstanceOf(OrderMappingError);
    });
  });

  it('lists closed orders with their payments in one batch (P32)', async () => {
    await inTransaction(db, async (ordersRepo, menuRepo, _tx, receipts) => {
      const firstId = id();
      const secondId = id();
      const thirdId = id();
      const cash = cashPayment(firstId, 16420, 20000, 'pay-1');
      const card = cardPayment(secondId, '4242', 'pay-2');
      const gateway = gatewayPayment(thirdId, 'cliente@correo.mx', 'pay-3');

      await ordersRepo.save((await seedReadyOrderL(ordersRepo, menuRepo, firstId)).close(cash));
      await ordersRepo.save((await seedReadyOrderL(ordersRepo, menuRepo, secondId)).close(card));
      await ordersRepo.save((await seedReadyOrderL(ordersRepo, menuRepo, thirdId)).close(gateway));
      receipts.put(firstId, cash);
      receipts.put(secondId, card);
      receipts.put(thirdId, gateway);

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

  it('rejects a closed order whose receipt does not arrive (P33)', async () => {
    await inTransaction(db, async (ordersRepo, menuRepo) => {
      const orderId = id();
      const ready = await seedReadyOrderL(ordersRepo, menuRepo, orderId);
      await ordersRepo.save(ready.close(cashPayment(orderId)));

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

  it('no longer has a foreign key from order lines to menu items (F1)', async () => {
    const rows = await db.execute(sql`
      SELECT conname
      FROM pg_constraint
      WHERE conname = 'order_lines_menu_item_id_menu_items_id_fk'
    `);

    expect(rows).toHaveLength(0);
  });

  it('keeps menu_item_id not null on order lines (F2)', async () => {
    const rows = await db.execute<{ is_nullable: string }>(sql`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'order_lines'
        AND column_name = 'menu_item_id'
    `);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.is_nullable).toBe('NO');
  });

  it('persists a line whose menu item has no catalog row (F3)', async () => {
    const orderId = id();
    const menuItemId = id();

    await inTransaction(db, async (ordersRepo, _menuRepo, tx) => {
      const dish = tacosDish(menuItemId);
      const order = Order.open({
        id: orderId,
        origin: OrderOrigin.table(`f3-${orderId.slice(0, 8)}`),
        openedAt: OPENED_AT,
      }).addLine(
        LineItem.capture({
          id: id(),
          menuItem: dish,
          quantity: Quantity.of(1),
          modifierIds: [],
        }),
      );

      await ordersRepo.add(order);
      const found = await ordersRepo.findById(orderId);
      const line = found?.lines[0];

      expect(line?.menuItemId).toBe(menuItemId);
      expect(line?.name).toBe('Tacos');
      expect(line?.unitPrice.amount).toBe(4500);
      expect(line?.unitPrice.currency).toBe('MXN');
      expect(line?.applicableTax.basisPoints).toBe(1600);

      const menuRows = await tx
        .select({ id: menuItems.id })
        .from(menuItems)
        .where(eq(menuItems.id, menuItemId));
      expect(menuRows).toHaveLength(0);
    });
  });
});


class RollbackSignal extends Error {
  constructor() {
    super('rollback');
    this.name = 'RollbackSignal';
  }
}

let seededReceipts = new Map<string, Payment>();

async function inTransaction(
  db: AppDatabase,
  run: (
    orders: DrizzleOrderRepository,
    menu: DrizzleMenuRepository,
    tx: OrderDatabase & MenuDatabase,
    receipts: InMemoryPaymentReceipts,
  ) => Promise<void>,
): Promise<void> {
  let failure: unknown;

  try {
    await db.transaction(async (tx) => {
      const receipts = new InMemoryPaymentReceipts(seededReceipts);
      const ordersRepo = new DrizzleOrderRepository(tx, receipts);
      const menuRepo = new DrizzleMenuRepository(tx);
      try {
        await run(ordersRepo, menuRepo, tx, receipts);
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

class InMemoryPaymentReceipts implements PaymentReceiptQuery {
  private readonly bySubject = new Map<string, Payment>();

  constructor(seeded: ReadonlyMap<string, Payment>) {
    for (const [subjectId, payment] of seeded) {
      this.bySubject.set(subjectId, payment);
    }
  }

  put(subjectId: string, payment: Payment): void {
    this.bySubject.set(subjectId, payment);
  }

  findBySubjectId(subjectId: string): Promise<Payment | null> {
    return Promise.resolve(this.bySubject.get(subjectId) ?? null);
  }
}

type StoredReceipt = {
  paymentId: string;
  subjectId: string;
  method: string;
  amount: number;
  currency: string;
  tenderedAmount: number | null;
  cardLast4: string | null;
  payerReference: string | null;
  reference: string;
  paidAt: Date;
};

async function loadApprovedReceipts(): Promise<Map<string, Payment>> {
  const sql = postgres(paymentsDatabaseUrl(), { max: 1 });
  try {
    const rows = await sql<StoredReceipt[]>`
      select
        payment_id as "paymentId",
        subject_id as "subjectId",
        method,
        amount,
        currency,
        tendered_amount as "tenderedAmount",
        card_last4 as "cardLast4",
        payer_reference as "payerReference",
        reference,
        paid_at as "paidAt"
      from payments
      where status = 'approved'
    `;
    const receipts = new Map<string, Payment>();
    for (const row of rows) {
      receipts.set(row.subjectId, paymentFromStored(row));
    }
    return receipts;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

function paymentFromStored(row: StoredReceipt): Payment {
  const amount = Money.of(row.amount, row.currency);
  if (row.method === 'cash') {
    if (row.tenderedAmount === null) {
      throw new Error('Stored cash receipt is missing the tendered amount');
    }
    return Payment.restore({
      id: row.paymentId,
      amount,
      details: PaymentDetails.cash(Money.of(row.tenderedAmount, row.currency)),
      reference: row.reference,
      paidAt: row.paidAt,
    });
  }
  if (row.method === 'card') {
    return Payment.restore({
      id: row.paymentId,
      amount,
      details: PaymentDetails.card(row.cardLast4),
      reference: row.reference,
      paidAt: row.paidAt,
    });
  }
  return Payment.restore({
    id: row.paymentId,
    amount,
    details: PaymentDetails.digitalGateway(row.payerReference),
    reference: row.reference,
    paidAt: row.paidAt,
  });
}

function paymentsDatabaseUrl(): string {
  if (process.env.PAYMENTS_DATABASE_URL) {
    return process.env.PAYMENTS_DATABASE_URL;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to load payment receipts');
  }
  const url = new URL(databaseUrl);
  url.pathname = '/payments';
  return url.toString();
}

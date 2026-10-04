import { describe, expect, it } from 'vitest';
import { LineItem } from '../../domain/order/line-item';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import {
  DuplicateModifierSelectionError,
  InvalidQuantityError,
  MenuItemUnavailableError,
  OrderNotEditableError,
  UnknownModifierError,
} from '../../domain/order/order.errors';
import { Quantity } from '../../domain/order/quantity';
import { MenuItemNotFoundError } from '../menu/menu-item-repository.errors';
import { AddLine } from './add-line';
import { InMemoryOrderRepository } from './in-memory-order-repository';
import {
  OrderConcurrencyError,
  OrderNotFoundError,
} from './order-repository.errors';
import {
  FIXED_NOW,
  OTHER_EXTRA_ID,
  QUESO_ID,
  TACOS_ID,
  flanDish,
  idsOf,
  otherDishWithExtra,
  seedMenu,
  tacosDish,
  watchOrders,
  withConcurrentSave,
} from './order-test-fixtures';

async function openWithTacos() {
  const orders = new InMemoryOrderRepository();
  await orders.add(
    Order.open({ id: 'order-1', origin: OrderOrigin.table('5'), openedAt: FIXED_NOW }),
  );
  const menu = await seedMenu(tacosDish(), flanDish(), otherDishWithExtra());
  return { orders, menu };
}

describe('AddLine', () => {
  it('adds tacos x2 with Queso on an OPEN order (A1)', async () => {
    const { orders, menu } = await openWithTacos();
    const seen = watchOrders(orders);
    const useCase = new AddLine(seen.orders, menu, idsOf('line-1'));

    const order = await useCase.execute({
      orderId: 'order-1',
      menuItemId: TACOS_ID,
      quantity: 2,
      modifierIds: [QUESO_ID],
    });

    expect(seen.calls.save).toBe(1);
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]?.id).toBe('line-1');
    expect(order.lines[0]?.quantity.amount).toBe(2);
    expect(order.lines[0]?.modifiers[0]?.name).toBe('Queso');
    expect(order.version).toBe(1);
  });

  it('rejects a missing order and does not save (A2)', async () => {
    const menu = await seedMenu(tacosDish());
    const seen = watchOrders(new InMemoryOrderRepository());
    const useCase = new AddLine(seen.orders, menu, idsOf('line-1'));

    await expect(
      useCase.execute({
        orderId: 'missing',
        menuItemId: TACOS_ID,
        quantity: 1,
        modifierIds: [],
      }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects IN_KITCHEN before looking up the dish (A3)', async () => {
    const orders = new InMemoryOrderRepository();
    await orders.add(
      Order.restore({
        id: 'order-1',
        origin: OrderOrigin.table('5'),
        status: 'IN_KITCHEN',
        openedAt: FIXED_NOW,
        lines: [
          LineItem.capture({
            id: 'line-1',
            menuItem: tacosDish(),
            quantity: Quantity.of(1),
            modifierIds: [],
          }),
        ],
        version: 1,
      }),
    );
    const seen = watchOrders(orders);
    const useCase = new AddLine(seen.orders, await seedMenu(), idsOf('line-2'));

    await expect(
      useCase.execute({
        orderId: 'order-1',
        menuItemId: 'does-not-exist',
        quantity: 1,
        modifierIds: [],
      }),
    ).rejects.toBeInstanceOf(OrderNotEditableError);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects a missing dish on OPEN and does not save (A4)', async () => {
    const { orders, menu } = await openWithTacos();
    const seen = watchOrders(orders);
    const useCase = new AddLine(seen.orders, menu, idsOf('line-1'));

    await expect(
      useCase.execute({
        orderId: 'order-1',
        menuItemId: 'missing-dish',
        quantity: 1,
        modifierIds: [],
      }),
    ).rejects.toBeInstanceOf(MenuItemNotFoundError);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects an inactive dish and does not save (A5)', async () => {
    const { orders, menu } = await openWithTacos();
    const seen = watchOrders(orders);
    const useCase = new AddLine(seen.orders, menu, idsOf('line-1'));

    await expect(
      useCase.execute({
        orderId: 'order-1',
        menuItemId: flanDish().id,
        quantity: 1,
        modifierIds: [],
      }),
    ).rejects.toBeInstanceOf(MenuItemUnavailableError);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects bad quantity, foreign modifier, and duplicate modifier without save (A6)', async () => {
    const { orders, menu } = await openWithTacos();
    const cases: Array<{
      quantity: number;
      modifierIds: string[];
      error: new () => Error;
    }> = [
      { quantity: 0, modifierIds: [], error: InvalidQuantityError },
      { quantity: 1, modifierIds: [OTHER_EXTRA_ID], error: UnknownModifierError },
      { quantity: 1, modifierIds: [QUESO_ID, QUESO_ID], error: DuplicateModifierSelectionError },
    ];

    for (const entry of cases) {
      const seen = watchOrders(orders);
      const useCase = new AddLine(seen.orders, menu, idsOf('line-1'));

      await expect(
        useCase.execute({
          orderId: 'order-1',
          menuItemId: TACOS_ID,
          quantity: entry.quantity,
          modifierIds: entry.modifierIds,
        }),
      ).rejects.toBeInstanceOf(entry.error);
      expect(seen.calls.save).toBe(0);
    }
  });

  it('rejects when another save happened between read and write (A7)', async () => {
    const { orders, menu } = await openWithTacos();
    const concurrent = withConcurrentSave(orders, (order) =>
      order.addLine(
        LineItem.capture({
          id: 'line-other',
          menuItem: tacosDish(),
          quantity: Quantity.of(1),
          modifierIds: [],
        }),
      ),
    );
    const useCase = new AddLine(concurrent, menu, idsOf('line-1'));

    await expect(
      useCase.execute({
        orderId: 'order-1',
        menuItemId: TACOS_ID,
        quantity: 1,
        modifierIds: [QUESO_ID],
      }),
    ).rejects.toBeInstanceOf(OrderConcurrencyError);

    const stored = await orders.findById('order-1');
    expect(stored?.lines.map((line) => line.id)).toEqual(['line-other']);
  });

  it('rejects when StartCooking was saved between read and write (A8)', async () => {
    const orders = new InMemoryOrderRepository();
    await orders.add(
      Order.open({ id: 'order-1', origin: OrderOrigin.table('5'), openedAt: FIXED_NOW }).addLine(
        LineItem.capture({
          id: 'line-1',
          menuItem: tacosDish(),
          quantity: Quantity.of(1),
          modifierIds: [],
        }),
      ),
    );
    const menu = await seedMenu(tacosDish());
    const concurrent = withConcurrentSave(orders, (order) => order.startCooking());
    const useCase = new AddLine(concurrent, menu, idsOf('line-2'));

    await expect(
      useCase.execute({
        orderId: 'order-1',
        menuItemId: TACOS_ID,
        quantity: 1,
        modifierIds: [QUESO_ID],
      }),
    ).rejects.toBeInstanceOf(OrderConcurrencyError);

    const stored = await orders.findById('order-1');
    expect(stored?.status).toBe('IN_KITCHEN');
    expect(stored?.lines.map((line) => line.id)).toEqual(['line-1']);
  });
});

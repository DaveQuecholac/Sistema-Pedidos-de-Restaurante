import { describe, expect, it } from 'vitest';
import { Money } from '../../domain/money/money';
import { LineItem } from '../../domain/order/line-item';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import {
  LineItemNotFoundError,
  MenuItemUnavailableError,
  OrderNotEditableError,
} from '../../domain/order/order.errors';
import { Quantity } from '../../domain/order/quantity';
import { InMemoryOrderRepository } from './in-memory-order-repository';
import { ModifyLine } from './modify-line';
import {
  CILANTRO_ID,
  FIXED_NOW,
  QUESO_ID,
  TACOS_ID,
  seedMenu,
  tacosDish,
  watchOrders,
} from './order-test-fixtures';

async function orderWithTacosLine() {
  const dish = tacosDish();
  const orders = new InMemoryOrderRepository();
  await orders.add(
    Order.open({ id: 'order-1', origin: OrderOrigin.table('5'), openedAt: FIXED_NOW }).addLine(
      LineItem.capture({
        id: 'line-1',
        menuItem: dish,
        quantity: Quantity.of(1),
        modifierIds: [QUESO_ID],
      }),
    ),
  );
  const menu = await seedMenu(dish);
  return { orders, menu };
}

describe('ModifyLine', () => {
  it('recaptures quantity and Cilantro exclusion keeping line id and position (M1)', async () => {
    const { orders, menu } = await orderWithTacosLine();
    await orders.save(
      (await orders.findById('order-1'))!.addLine(
        LineItem.capture({
          id: 'line-2',
          menuItem: tacosDish(),
          quantity: Quantity.of(1),
          modifierIds: [],
        }),
      ),
    );
    const seen = watchOrders(orders);
    const useCase = new ModifyLine(seen.orders, menu);

    const order = await useCase.execute({
      orderId: 'order-1',
      lineId: 'line-1',
      quantity: 3,
      modifierIds: [CILANTRO_ID],
    });

    expect(seen.calls.save).toBe(1);
    expect(order.lines.map((line) => line.id)).toEqual(['line-1', 'line-2']);
    expect(order.lines[0]?.quantity.amount).toBe(3);
    expect(order.lines[0]?.modifiers[0]?.kind).toBe('exclusion');
    expect(order.lines[0]?.modifiers[0]?.name).toBe('Cilantro');
  });

  it('recaptures the current dish price after the menu changed (M2)', async () => {
    const { orders, menu } = await orderWithTacosLine();
    const current = await menu.findById(TACOS_ID);
    await menu.save(
      current!.replace({
        name: current!.name,
        price: Money.of(5000, 'MXN'),
        applicableTax: current!.applicableTax,
        active: true,
        ingredients: current!.ingredients,
        modifiers: current!.modifiers,
      }),
    );
    const useCase = new ModifyLine(orders, menu);

    const order = await useCase.execute({
      orderId: 'order-1',
      lineId: 'line-1',
      quantity: 1,
      modifierIds: [QUESO_ID],
    });

    expect(order.lines[0]?.unitPrice.amount).toBe(5000);
  });

  it('rejects a deactivated dish and leaves the old line (M3)', async () => {
    const { orders, menu } = await orderWithTacosLine();
    const current = await menu.findById(TACOS_ID);
    await menu.save(current!.deactivate());
    const seen = watchOrders(orders);
    const useCase = new ModifyLine(seen.orders, menu);

    await expect(
      useCase.execute({
        orderId: 'order-1',
        lineId: 'line-1',
        quantity: 2,
        modifierIds: [QUESO_ID],
      }),
    ).rejects.toBeInstanceOf(MenuItemUnavailableError);
    expect(seen.calls.save).toBe(0);

    const stored = await orders.findById('order-1');
    expect(stored?.lines[0]?.unitPrice.amount).toBe(4500);
    expect(stored?.lines[0]?.quantity.amount).toBe(1);
  });

  it('rejects a missing line id and does not save (M4)', async () => {
    const { orders, menu } = await orderWithTacosLine();
    const seen = watchOrders(orders);
    const useCase = new ModifyLine(seen.orders, menu);

    await expect(
      useCase.execute({
        orderId: 'order-1',
        lineId: 'missing',
        quantity: 1,
        modifierIds: [],
      }),
    ).rejects.toBeInstanceOf(LineItemNotFoundError);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects modify on IN_KITCHEN and does not save (M5)', async () => {
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
            modifierIds: [QUESO_ID],
          }),
        ],
        version: 1,
      discount: null,
      tip: null,
      payment: null,
    }),
    );
    const seen = watchOrders(orders);
    const useCase = new ModifyLine(seen.orders, await seedMenu(tacosDish()));

    await expect(
      useCase.execute({
        orderId: 'order-1',
        lineId: 'line-1',
        quantity: 2,
        modifierIds: [QUESO_ID],
      }),
    ).rejects.toBeInstanceOf(OrderNotEditableError);
    expect(seen.calls.save).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { LineItem } from '../../domain/order/line-item';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import {
  EmptyOrderError,
  InvalidOrderTransitionError,
  OrderNotEditableError,
} from '../../domain/order/order.errors';
import { Quantity } from '../../domain/order/quantity';
import { AddLine } from './add-line';
import { InMemoryOrderRepository } from './in-memory-order-repository';
import {
  FIXED_NOW,
  TACOS_ID,
  idsOf,
  seedMenu,
  tacosDish,
  watchOrders,
} from './order-test-fixtures';
import { StartCooking } from './start-cooking';

describe('StartCooking', () => {
  it('moves OPEN with lines to IN_KITCHEN (SC1)', async () => {
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
    const seen = watchOrders(orders);
    const useCase = new StartCooking(seen.orders);

    const order = await useCase.execute('order-1');

    expect(seen.calls.save).toBe(1);
    expect(order.status).toBe('IN_KITCHEN');
  });

  it('rejects an empty OPEN order and does not save (SC2)', async () => {
    const orders = new InMemoryOrderRepository();
    await orders.add(
      Order.open({ id: 'order-1', origin: OrderOrigin.table('5'), openedAt: FIXED_NOW }),
    );
    const seen = watchOrders(orders);
    const useCase = new StartCooking(seen.orders);

    await expect(useCase.execute('order-1')).rejects.toBeInstanceOf(EmptyOrderError);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects startCooking when already IN_KITCHEN (SC3)', async () => {
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
    const useCase = new StartCooking(seen.orders);

    await expect(useCase.execute('order-1')).rejects.toBeInstanceOf(InvalidOrderTransitionError);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects AddLine after StartCooking (SC4)', async () => {
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
    await new StartCooking(orders).execute('order-1');
    const addLine = new AddLine(orders, await seedMenu(tacosDish()), idsOf('line-2'));

    await expect(
      addLine.execute({
        orderId: 'order-1',
        menuItemId: TACOS_ID,
        quantity: 1,
        modifierIds: [],
      }),
    ).rejects.toBeInstanceOf(OrderNotEditableError);
  });
});

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
import { SendToKitchen } from './send-to-kitchen';

describe('SendToKitchen', () => {
  it('moves OPEN with lines to SENT_TO_KITCHEN (SK1)', async () => {
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
    const useCase = new SendToKitchen(seen.orders);

    const order = await useCase.execute('order-1');

    expect(seen.calls.save).toBe(1);
    expect(order.status).toBe('SENT_TO_KITCHEN');
    expect(order.allowedActions()).toEqual(['beginCooking', 'cancel']);
  });

  it('rejects an empty OPEN order and does not save (SK2)', async () => {
    const orders = new InMemoryOrderRepository();
    await orders.add(
      Order.open({ id: 'order-1', origin: OrderOrigin.table('5'), openedAt: FIXED_NOW }),
    );
    const seen = watchOrders(orders);
    const useCase = new SendToKitchen(seen.orders);

    await expect(useCase.execute('order-1')).rejects.toBeInstanceOf(EmptyOrderError);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects send when already SENT_TO_KITCHEN or IN_KITCHEN (SK3)', async () => {
    for (const status of ['SENT_TO_KITCHEN', 'IN_KITCHEN'] as const) {
      const orders = new InMemoryOrderRepository();
      await orders.add(
        Order.restore({
          id: 'order-1',
          origin: OrderOrigin.table('5'),
          status,
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
      discount: null,
      tip: null,
    }),
      );
      const seen = watchOrders(orders);
      const useCase = new SendToKitchen(seen.orders);

      await expect(useCase.execute('order-1')).rejects.toBeInstanceOf(InvalidOrderTransitionError);
      expect(seen.calls.save).toBe(0);
    }
  });

  it('rejects AddLine after SendToKitchen (SK4)', async () => {
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
    await new SendToKitchen(orders).execute('order-1');
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

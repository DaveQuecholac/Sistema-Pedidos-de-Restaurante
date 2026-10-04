import { describe, expect, it } from 'vitest';
import { LineItem } from '../../domain/order/line-item';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import { InvalidOrderTransitionError } from '../../domain/order/order.errors';
import { Quantity } from '../../domain/order/quantity';
import { InMemoryOrderRepository } from './in-memory-order-repository';
import { MarkOrderReady } from './mark-order-ready';
import { FIXED_NOW, tacosDish, watchOrders } from './order-test-fixtures';

describe('MarkOrderReady', () => {
  it('moves IN_KITCHEN to READY (MR1)', async () => {
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
    const useCase = new MarkOrderReady(orders);

    const order = await useCase.execute('order-1');

    expect(order.status).toBe('READY');
  });

  it('rejects markReady from OPEN (MR2)', async () => {
    const orders = new InMemoryOrderRepository();
    await orders.add(
      Order.open({ id: 'order-1', origin: OrderOrigin.table('5'), openedAt: FIXED_NOW }),
    );
    const seen = watchOrders(orders);
    const useCase = new MarkOrderReady(seen.orders);

    await expect(useCase.execute('order-1')).rejects.toBeInstanceOf(InvalidOrderTransitionError);
    expect(seen.calls.save).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { LineItem } from '../../domain/order/line-item';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import { InvalidOrderTransitionError } from '../../domain/order/order.errors';
import { Quantity } from '../../domain/order/quantity';
import { BeginCooking } from './begin-cooking';
import { CancelOrder } from './cancel-order';
import { InMemoryOrderRepository } from './in-memory-order-repository';
import { MarkOrderReady } from './mark-order-ready';
import { FIXED_NOW, tacosDish, watchOrders } from './order-test-fixtures';

function sentOrder(): Order {
  return Order.restore({
    id: 'order-1',
    origin: OrderOrigin.table('5'),
    status: 'SENT_TO_KITCHEN',
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
  });
}

describe('BeginCooking', () => {
  it('moves SENT_TO_KITCHEN to IN_KITCHEN (BC1)', async () => {
    const orders = new InMemoryOrderRepository();
    await orders.add(sentOrder());
    const seen = watchOrders(orders);
    const useCase = new BeginCooking(seen.orders);

    const order = await useCase.execute('order-1');

    expect(seen.calls.save).toBe(1);
    expect(order.status).toBe('IN_KITCHEN');
    expect(order.allowedActions()).toEqual(['markReady']);
  });

  it('rejects beginCooking from OPEN (BC2)', async () => {
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
    const useCase = new BeginCooking(seen.orders);

    await expect(useCase.execute('order-1')).rejects.toBeInstanceOf(InvalidOrderTransitionError);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects beginCooking when already IN_KITCHEN (BC3)', async () => {
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
    const useCase = new BeginCooking(seen.orders);

    await expect(useCase.execute('order-1')).rejects.toBeInstanceOf(InvalidOrderTransitionError);
    expect(seen.calls.save).toBe(0);
  });

  it('allows markReady only after beginCooking (BC4)', async () => {
    const orders = new InMemoryOrderRepository();
    await orders.add(sentOrder());

    await expect(new MarkOrderReady(orders).execute('order-1')).rejects.toBeInstanceOf(
      InvalidOrderTransitionError,
    );

    await new BeginCooking(orders).execute('order-1');
    const ready = await new MarkOrderReady(orders).execute('order-1');
    expect(ready.status).toBe('READY');
  });

  it('blocks cancel after beginCooking (BC5)', async () => {
    const orders = new InMemoryOrderRepository();
    await orders.add(sentOrder());
    await new BeginCooking(orders).execute('order-1');

    await expect(new CancelOrder(orders).execute('order-1')).rejects.toBeInstanceOf(
      InvalidOrderTransitionError,
    );
  });
});

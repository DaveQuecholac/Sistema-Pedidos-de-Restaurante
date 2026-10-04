import { describe, expect, it } from 'vitest';
import { LineItem } from '../../domain/order/line-item';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import { InvalidOrderTransitionError } from '../../domain/order/order.errors';
import { Quantity } from '../../domain/order/quantity';
import { CancelOrder } from './cancel-order';
import { InMemoryOrderRepository } from './in-memory-order-repository';
import { OpenOrder } from './open-order';
import { ExternalOrderIdInUseError } from './order-repository.errors';
import { FIXED_NOW, idsOf, tacosDish, watchOrders } from './order-test-fixtures';

describe('CancelOrder', () => {
  it('cancels OPEN and IN_KITCHEN keeping lines (X1)', async () => {
    const orders = new InMemoryOrderRepository();
    const line = LineItem.capture({
      id: 'line-1',
      menuItem: tacosDish(),
      quantity: Quantity.of(1),
      modifierIds: [],
    });
    await orders.add(
      Order.open({ id: 'order-open', origin: OrderOrigin.table('1'), openedAt: FIXED_NOW }).addLine(
        line,
      ),
    );
    await orders.add(
      Order.restore({
        id: 'order-kitchen',
        origin: OrderOrigin.table('2'),
        status: 'IN_KITCHEN',
        openedAt: FIXED_NOW,
        lines: [line],
        version: 1,
      }),
    );
    const useCase = new CancelOrder(orders);

    const cancelledOpen = await useCase.execute('order-open');
    const cancelledKitchen = await useCase.execute('order-kitchen');

    expect(cancelledOpen.status).toBe('CANCELLED');
    expect(cancelledOpen.lines).toHaveLength(1);
    expect(cancelledKitchen.status).toBe('CANCELLED');
    expect(cancelledKitchen.lines).toHaveLength(1);
  });

  it('rejects cancel from READY and CANCELLED without save (X2)', async () => {
    for (const status of ['READY', 'CANCELLED'] as const) {
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
        }),
      );
      const seen = watchOrders(orders);
      const useCase = new CancelOrder(seen.orders);

      await expect(useCase.execute('order-1')).rejects.toBeInstanceOf(InvalidOrderTransitionError);
      expect(seen.calls.save).toBe(0);
    }
  });

  it('keeps the external id blocked after cancel (X3)', async () => {
    const orders = new InMemoryOrderRepository();
    await orders.add(
      Order.open({
        id: 'order-1',
        origin: OrderOrigin.external('UBER-1'),
        openedAt: FIXED_NOW,
      }),
    );
    await new CancelOrder(orders).execute('order-1');

    const open = new OpenOrder(orders, idsOf('order-2'), () => FIXED_NOW);

    await expect(open.execute({ externalOrderId: 'UBER-1' })).rejects.toBeInstanceOf(
      ExternalOrderIdInUseError,
    );
  });
});

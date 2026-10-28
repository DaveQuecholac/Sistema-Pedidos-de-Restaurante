import { describe, expect, it } from 'vitest';
import { LineItem } from '../../domain/order/line-item';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import {
  LineItemNotFoundError,
  OrderNotEditableError,
} from '../../domain/order/order.errors';
import { Quantity } from '../../domain/order/quantity';
import { CancelLine } from './cancel-line';
import { InMemoryOrderRepository } from './in-memory-order-repository';
import { FIXED_NOW, QUESO_ID, tacosDish, watchOrders } from './order-test-fixtures';

describe('CancelLine', () => {
  it('removes an existing line on OPEN (K1)', async () => {
    const orders = new InMemoryOrderRepository();
    await orders.add(
      Order.open({ id: 'order-1', origin: OrderOrigin.table('5'), openedAt: FIXED_NOW }).addLine(
        LineItem.capture({
          id: 'line-1',
          menuItem: tacosDish(),
          quantity: Quantity.of(1),
          modifierIds: [QUESO_ID],
        }),
      ),
    );
    const seen = watchOrders(orders);
    const useCase = new CancelLine(seen.orders);

    const order = await useCase.execute({ orderId: 'order-1', lineId: 'line-1' });

    expect(seen.calls.save).toBe(1);
    expect(order.lines).toEqual([]);
  });

  it('rejects cancel on IN_KITCHEN (K2)', async () => {
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
      discount: null,
      tip: null,
      payment: null,
    }),
    );
    const seen = watchOrders(orders);
    const useCase = new CancelLine(seen.orders);

    await expect(
      useCase.execute({ orderId: 'order-1', lineId: 'line-1' }),
    ).rejects.toBeInstanceOf(OrderNotEditableError);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects a missing line id (K3)', async () => {
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
    const useCase = new CancelLine(seen.orders);

    await expect(
      useCase.execute({ orderId: 'order-1', lineId: 'missing' }),
    ).rejects.toBeInstanceOf(LineItemNotFoundError);
    expect(seen.calls.save).toBe(0);
  });
});

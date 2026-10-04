import { describe, expect, it } from 'vitest';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import { InMemoryOrderRepository } from './in-memory-order-repository';
import { ListOrders } from './list-orders';
import { FIXED_NOW } from './order-test-fixtures';

describe('ListOrders', () => {
  it('lists all or filtered statuses in order (C8)', async () => {
    const repo = new InMemoryOrderRepository();
    const earlier = new Date('2026-10-04T17:00:00.000Z');
    await repo.add(
      Order.restore({
        id: 'order-kitchen',
        origin: OrderOrigin.table('1'),
        status: 'IN_KITCHEN',
        openedAt: FIXED_NOW,
        lines: [],
        version: 1,
      }),
    );
    await repo.add(
      Order.open({ id: 'order-open', origin: OrderOrigin.table('2'), openedAt: earlier }),
    );
    await repo.add(
      Order.restore({
        id: 'order-ready',
        origin: OrderOrigin.table('3'),
        status: 'READY',
        openedAt: FIXED_NOW,
        lines: [],
        version: 2,
      }),
    );

    const useCase = new ListOrders(repo);
    const all = await useCase.execute({ statuses: null });
    const filtered = await useCase.execute({ statuses: ['OPEN', 'IN_KITCHEN'] });

    expect(all.map((order) => order.id)).toEqual([
      'order-open',
      'order-kitchen',
      'order-ready',
    ]);
    expect(filtered.map((order) => order.id)).toEqual(['order-open', 'order-kitchen']);
  });
});

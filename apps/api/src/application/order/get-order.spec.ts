import { describe, expect, it } from 'vitest';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import { GetOrder } from './get-order';
import { InMemoryOrderRepository } from './in-memory-order-repository';
import { OrderNotFoundError } from './order-repository.errors';
import { FIXED_NOW } from './order-test-fixtures';

describe('GetOrder', () => {
  it('rejects a missing order id (C7)', async () => {
    const useCase = new GetOrder(new InMemoryOrderRepository());

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it('returns an existing order', async () => {
    const repo = new InMemoryOrderRepository();
    await repo.add(
      Order.open({ id: 'order-1', origin: OrderOrigin.table('5'), openedAt: FIXED_NOW }),
    );

    const order = await new GetOrder(repo).execute('order-1');

    expect(order.id).toBe('order-1');
  });
});

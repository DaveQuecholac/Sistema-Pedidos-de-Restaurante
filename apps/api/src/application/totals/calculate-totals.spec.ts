import { describe, expect, it } from 'vitest';
import { LineItem } from '../../domain/order/line-item';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import { Quantity } from '../../domain/order/quantity';
import { InMemoryOrderRepository } from '../order/in-memory-order-repository';
import { OrderNotFoundError } from '../order/order-repository.errors';
import {
  AGUA_ID,
  FIXED_NOW,
  QUESO_ID,
  TACOS_ID,
  aguaDish,
  tacosDish,
  watchOrders,
} from '../order/order-test-fixtures';
import { CalculateTotals } from './calculate-totals';

async function seedOrderL(status: 'OPEN' | 'CANCELLED' = 'OPEN'): Promise<InMemoryOrderRepository> {
  const orders = new InMemoryOrderRepository();
  const order = Order.restore({
    id: 'order-1',
    origin: OrderOrigin.table('5'),
    status,
    openedAt: FIXED_NOW,
    version: 1,
    discount: null,
    tip: null,
    payment: null,
    lines: [
      LineItem.capture({
        id: 'line-tacos',
        menuItem: tacosDish(),
        quantity: Quantity.of(2),
        modifierIds: [QUESO_ID],
      }),
      LineItem.capture({
        id: 'line-agua',
        menuItem: aguaDish(),
        quantity: Quantity.of(1),
        modifierIds: [],
      }),
    ],
  });
  await orders.add(order);
  return orders;
}

describe('CalculateTotals', () => {
  it('returns the TT3 breakdown for order L (CT1)', async () => {
    const orders = await seedOrderL();
    const totals = await new CalculateTotals(orders).execute('order-1');

    expect(totals.subtotal.amount).toBe(14500);
    expect(totals.discount).toBeNull();
    expect(totals.tip).toBeNull();
    expect(
      totals.taxes.map((tax) => ({
        rate: tax.taxRate.basisPoints,
        base: tax.taxableBase.amount,
        amount: tax.amount.amount,
      })),
    ).toEqual([
      { rate: 0, base: 2500, amount: 0 },
      { rate: 1600, base: 12000, amount: 1920 },
    ]);
    expect(totals.taxTotal.amount).toBe(1920);
    expect(totals.total.amount).toBe(16420);
    expect(totals.lines.map((line) => line.lineId)).toEqual(['line-tacos', 'line-agua']);
    expect(TACOS_ID && AGUA_ID).toBeTruthy();
  });

  it('rejects a missing order (CT2)', async () => {
    const orders = new InMemoryOrderRepository();
    await expect(new CalculateTotals(orders).execute('missing')).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });

  it('calculates a cancelled order L and leaves canAdjustTotals false (CT3)', async () => {
    const orders = await seedOrderL('CANCELLED');
    const totals = await new CalculateTotals(orders).execute('order-1');
    const order = await orders.findById('order-1');

    expect(totals.total.amount).toBe(16420);
    expect(totals.taxTotal.amount).toBe(1920);
    expect(order?.canAdjustTotals()).toBe(false);
  });

  it('never saves (CT4)', async () => {
    const orders = await seedOrderL();
    const seen = watchOrders(orders);

    await new CalculateTotals(seen.orders).execute('order-1');

    expect(seen.calls.save).toBe(0);
  });
});

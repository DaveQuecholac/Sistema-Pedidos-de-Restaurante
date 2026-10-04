import { describe, expect, it } from 'vitest';
import { InvalidMoneyError, Money } from '../../domain/money/money';
import { LineItem } from '../../domain/order/line-item';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import { OrderTotalsNotAdjustableError } from '../../domain/order/order.errors';
import { Quantity } from '../../domain/order/quantity';
import { Discount } from '../../domain/totals/discount';
import { Percentage } from '../../domain/totals/percentage';
import { Tip } from '../../domain/totals/tip';
import { InvalidPercentageError, InvalidTipError } from '../../domain/totals/totals.errors';
import { InMemoryOrderRepository } from '../order/in-memory-order-repository';
import {
  OrderConcurrencyError,
  OrderNotFoundError,
} from '../order/order-repository.errors';
import {
  FIXED_NOW,
  QUESO_ID,
  aguaDish,
  tacosDish,
  watchOrders,
  withConcurrentSave,
} from '../order/order-test-fixtures';
import type { AdjustmentCommand } from './adjustment-command';
import { SetOrderTip } from './set-order-tip';

async function seedOrderL(
  status: 'OPEN' | 'IN_KITCHEN' | 'CANCELLED' = 'OPEN',
): Promise<InMemoryOrderRepository> {
  const orders = new InMemoryOrderRepository();
  await orders.add(
    Order.restore({
      id: 'order-1',
      origin: OrderOrigin.table('5'),
      status,
      openedAt: FIXED_NOW,
      version: 0,
      discount: null,
      tip: null,
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
    }),
  );
  return orders;
}

describe('SetOrderTip', () => {
  it('saves a 10 percent tip and returns amount 1450 on full subtotal (SP1)', async () => {
    const orders = await seedOrderL();
    const seen = watchOrders(orders);
    const totals = await new SetOrderTip(seen.orders).execute({
      orderId: 'order-1',
      tip: { kind: 'percentage', basisPoints: 1000 },
    });

    expect(seen.calls.save).toBe(1);
    expect(totals.tip?.amount.amount).toBe(1450);
    expect((await orders.findById('order-1'))?.version).toBe(1);
  });

  it('saves a fixed tip of 5000 (SP2)', async () => {
    const totals = await new SetOrderTip(await seedOrderL()).execute({
      orderId: 'order-1',
      tip: { kind: 'fixedAmount', amount: 5000 },
    });

    expect(totals.tip?.amount.amount).toBe(5000);
  });

  it('clears an existing tip with null (SP3)', async () => {
    const orders = await seedOrderL();
    await orders.save(
      (await orders.findById('order-1'))!.setTip(Tip.percentage(Percentage.of(1000))),
    );
    const seen = watchOrders(orders);

    const totals = await new SetOrderTip(seen.orders).execute({
      orderId: 'order-1',
      tip: null,
    });

    expect(seen.calls.save).toBe(1);
    expect(totals.tip).toBeNull();
    expect((await orders.findById('order-1'))?.tip).toBeNull();
  });

  it('rejects invalid percentage basis points without saving (SP4)', async () => {
    const orders = await seedOrderL();
    const seen = watchOrders(orders);
    const useCase = new SetOrderTip(seen.orders);

    for (const basisPoints of [0, 10001, 1.5]) {
      await expect(
        useCase.execute({
          orderId: 'order-1',
          tip: { kind: 'percentage', basisPoints },
        }),
      ).rejects.toBeInstanceOf(InvalidPercentageError);
    }
    expect(seen.calls.save).toBe(0);
  });

  it('rejects invalid fixed amounts without saving (SP5)', async () => {
    const orders = await seedOrderL();
    const seen = watchOrders(orders);
    const useCase = new SetOrderTip(seen.orders);

    await expect(
      useCase.execute({ orderId: 'order-1', tip: { kind: 'fixedAmount', amount: 0 } }),
    ).rejects.toBeInstanceOf(InvalidTipError);
    await expect(
      useCase.execute({ orderId: 'order-1', tip: { kind: 'fixedAmount', amount: -1 } }),
    ).rejects.toBeInstanceOf(InvalidMoneyError);
    await expect(
      useCase.execute({ orderId: 'order-1', tip: { kind: 'fixedAmount', amount: 1.5 } }),
    ).rejects.toBeInstanceOf(InvalidMoneyError);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects an unknown kind without saving (SP6)', async () => {
    const orders = await seedOrderL();
    const seen = watchOrders(orders);

    await expect(
      new SetOrderTip(seen.orders).execute({
        orderId: 'order-1',
        tip: { kind: 'coupon' } as unknown as AdjustmentCommand,
      }),
    ).rejects.toBeInstanceOf(InvalidTipError);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects CANCELLED before validating the value (SP7)', async () => {
    const orders = await seedOrderL('CANCELLED');
    const seen = watchOrders(orders);

    await expect(
      new SetOrderTip(seen.orders).execute({
        orderId: 'order-1',
        tip: { kind: 'percentage', basisPoints: 0 },
      }),
    ).rejects.toBeInstanceOf(OrderTotalsNotAdjustableError);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects a missing order (SP8)', async () => {
    await expect(
      new SetOrderTip(new InMemoryOrderRepository()).execute({
        orderId: 'missing',
        tip: { kind: 'percentage', basisPoints: 1000 },
      }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it('rejects a concurrent save and does not keep the tip (SP9)', async () => {
    const orders = await seedOrderL();
    const concurrent = withConcurrentSave(orders, (order) =>
      order.setDiscount(Discount.fixedAmount(Money.of(5000, 'MXN'))),
    );

    await expect(
      new SetOrderTip(concurrent).execute({
        orderId: 'order-1',
        tip: { kind: 'percentage', basisPoints: 1000 },
      }),
    ).rejects.toBeInstanceOf(OrderConcurrencyError);

    const stored = await orders.findById('order-1');
    expect(stored?.tip).toBeNull();
    expect(stored?.discount?.kind).toBe('fixedAmount');
  });

  it('works on IN_KITCHEN without changing lines or status (SP10)', async () => {
    const orders = await seedOrderL('IN_KITCHEN');
    const before = await orders.findById('order-1');

    const totals = await new SetOrderTip(orders).execute({
      orderId: 'order-1',
      tip: { kind: 'percentage', basisPoints: 1000 },
    });
    const after = await orders.findById('order-1');

    expect(totals.tip?.amount.amount).toBe(1450);
    expect(after?.status).toBe('IN_KITCHEN');
    expect(after?.lines.map((line) => line.id)).toEqual(before?.lines.map((line) => line.id));
  });
});

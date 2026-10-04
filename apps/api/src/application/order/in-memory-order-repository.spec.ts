import { describe, expect, it } from 'vitest';
import { Ingredient } from '../../domain/menu/ingredient';
import { MenuItem } from '../../domain/menu/menu-item';
import { Modifier } from '../../domain/menu/modifier';
import { TaxRate } from '../../domain/menu/tax-rate';
import { Money } from '../../domain/money/money';
import { LineItem } from '../../domain/order/line-item';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import { Quantity } from '../../domain/order/quantity';
import { Discount } from '../../domain/totals/discount';
import { Percentage } from '../../domain/totals/percentage';
import { Tip } from '../../domain/totals/tip';
import { InMemoryOrderRepository } from './in-memory-order-repository';
import {
  OrderAlreadyExistsError,
  OrderConcurrencyError,
  OrderNotFoundError,
} from './order-repository.errors';

const OPENED_AT = new Date('2026-10-04T18:00:00.000Z');

function tacos(): MenuItem {
  return MenuItem.create({
    id: 'item-tacos',
    name: 'Tacos',
    price: Money.of(4500, 'MXN'),
    applicableTax: TaxRate.of(1600),
    ingredients: [Ingredient.of({ id: 'ing-1', name: 'Cilantro' })],
    modifiers: [
      Modifier.extra({ id: 'mod-queso', name: 'Queso', price: Money.of(1500, 'MXN') }),
      Modifier.exclusion({ id: 'mod-cilantro', name: 'Cilantro' }),
    ],
  });
}

function openOrder(id: string, origin: OrderOrigin = OrderOrigin.table('5')): Order {
  return Order.open({ id, origin, openedAt: OPENED_AT });
}

function line(id: string): LineItem {
  return LineItem.capture({
    id,
    menuItem: tacos(),
    quantity: Quantity.of(1),
    modifierIds: ['mod-queso'],
  });
}

describe('InMemoryOrderRepository', () => {
  it('stores an order and finds an equivalent copy at version 0 (RP1)', async () => {
    const repo = new InMemoryOrderRepository();
    const order = openOrder('order-1').addLine(line('line-1'));

    await repo.add(order);
    const found = await repo.findById('order-1');

    expect(found).not.toBeNull();
    expect(found?.id).toBe('order-1');
    expect(found?.status).toBe('OPEN');
    expect(found?.version).toBe(0);
    expect(found?.lines).toHaveLength(1);
    expect(found?.lines[0]?.modifiers[0]?.name).toBe('Queso');
    expect(found).not.toBe(order);
  });

  it('rejects add with a duplicate id (RP2)', async () => {
    const repo = new InMemoryOrderRepository();
    await repo.add(openOrder('order-1'));

    await expect(repo.add(openOrder('order-1'))).rejects.toBeInstanceOf(OrderAlreadyExistsError);
  });

  it('increments version on a successful save (RP3)', async () => {
    const repo = new InMemoryOrderRepository();
    await repo.add(openOrder('order-1'));

    const read = await repo.findById('order-1');
    expect(read).not.toBeNull();
    await repo.save(read!.addLine(line('line-1')));

    const saved = await repo.findById('order-1');
    expect(saved?.version).toBe(1);
    expect(saved?.lines).toHaveLength(1);
  });

  it('rejects a second save from a stale read (RP4)', async () => {
    const repo = new InMemoryOrderRepository();
    await repo.add(openOrder('order-1'));

    const first = await repo.findById('order-1');
    const second = await repo.findById('order-1');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    await repo.save(first!.addLine(line('line-1')));
    await expect(repo.save(second!.addLine(line('line-2')))).rejects.toBeInstanceOf(
      OrderConcurrencyError,
    );

    const stored = await repo.findById('order-1');
    expect(stored?.status).toBe('OPEN');
    expect(stored?.lines.map((item) => item.id)).toEqual(['line-1']);
    expect(stored?.version).toBe(1);
  });

  it('rejects save of a missing id (RP5)', async () => {
    const repo = new InMemoryOrderRepository();

    await expect(repo.save(openOrder('missing'))).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it('finds a CANCELLED order by externalOrderId (RP6)', async () => {
    const repo = new InMemoryOrderRepository();
    const cancelled = Order.restore({
      id: 'order-ext',
      origin: OrderOrigin.external('UBER-1'),
      status: 'CANCELLED',
      openedAt: OPENED_AT,
      lines: [line('line-1')],
      version: 3,
      discount: null,
      tip: null,
    });
    await repo.add(cancelled);

    const found = await repo.findByExternalOrderId('UBER-1');

    expect(found?.id).toBe('order-ext');
    expect(found?.status).toBe('CANCELLED');
    expect(found?.origin.externalOrderId).toBe('UBER-1');
  });

  it('lists only IN_KITCHEN orders sorted by openedAt then id (RP7)', async () => {
    const repo = new InMemoryOrderRepository();
    const later = new Date('2026-10-04T19:00:00.000Z');
    const earlier = new Date('2026-10-04T17:00:00.000Z');

    await repo.add(
      Order.restore({
        id: 'order-b',
        origin: OrderOrigin.table('2'),
        status: 'IN_KITCHEN',
        openedAt: later,
        lines: [line('line-b')],
        version: 1,
      discount: null,
      tip: null,
    }),
    );
    await repo.add(
      Order.restore({
        id: 'order-a',
        origin: OrderOrigin.table('1'),
        status: 'IN_KITCHEN',
        openedAt: earlier,
        lines: [line('line-a')],
        version: 1,
      discount: null,
      tip: null,
    }),
    );
    await repo.add(
      Order.restore({
        id: 'order-open',
        origin: OrderOrigin.table('3'),
        status: 'OPEN',
        openedAt: earlier,
        lines: [],
        version: 0,
      discount: null,
      tip: null,
    }),
    );
    await repo.add(
      Order.restore({
        id: 'order-c',
        origin: OrderOrigin.table('4'),
        status: 'IN_KITCHEN',
        openedAt: earlier,
        lines: [line('line-c')],
        version: 1,
      discount: null,
      tip: null,
    }),
    );

    const listed = await repo.list({ statuses: ['IN_KITCHEN'] });

    expect(listed.map((order) => order.id)).toEqual(['order-a', 'order-c', 'order-b']);
  });

  it('does not let a mutation of list results change what is stored (RP8)', async () => {
    const repo = new InMemoryOrderRepository();
    await repo.add(openOrder('order-1').addLine(line('line-1')));

    const listed = await repo.list({ statuses: null });
    listed.push(openOrder('order-fake'));
    listed[0]?.lines.push(line('line-fake'));

    const stored = await repo.findById('order-1');
    expect(stored?.lines).toHaveLength(1);
    expect(await repo.findById('order-fake')).toBeNull();
  });

  it('save keeps discount and tip and increments version (RP9)', async () => {
    const repo = new InMemoryOrderRepository();
    await repo.add(openOrder('order-1').addLine(line('line-1')));

    const discount = Discount.percentage(Percentage.of(1000));
    const tip = Tip.fixedAmount(Money.of(2000, 'MXN'));
    const read = await repo.findById('order-1');
    expect(read).not.toBeNull();

    await repo.save(read!.setDiscount(discount).setTip(tip));
    const saved = await repo.findById('order-1');

    expect(saved?.version).toBe(1);
    expect(saved?.discount?.kind).toBe('percentage');
    expect(saved?.discount?.amountFor(Money.of(14500, 'MXN')).amount).toBe(1450);
    expect(saved?.tip?.kind).toBe('fixedAmount');
    expect(saved?.tip?.amountFor(Money.zero('MXN')).amount).toBe(2000);
  });

  it('list returns each order with its adjustments (RP10)', async () => {
    const repo = new InMemoryOrderRepository();
    const discount = Discount.fixedAmount(Money.of(5000, 'MXN'));
    const tip = Tip.percentage(Percentage.of(1500));

    await repo.add(openOrder('order-a').addLine(line('line-a')).setDiscount(discount));
    await repo.add(openOrder('order-b').addLine(line('line-b')).setTip(tip));
    await repo.add(openOrder('order-c').addLine(line('line-c')));

    const listed = await repo.list({ statuses: null });
    const byId = new Map(listed.map((order) => [order.id, order]));

    expect(byId.get('order-a')?.discount?.kind).toBe('fixedAmount');
    expect(byId.get('order-a')?.tip).toBeNull();
    expect(byId.get('order-b')?.tip?.kind).toBe('percentage');
    expect(byId.get('order-b')?.discount).toBeNull();
    expect(byId.get('order-c')?.discount).toBeNull();
    expect(byId.get('order-c')?.tip).toBeNull();
  });
});


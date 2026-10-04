import { describe, expect, it } from 'vitest';
import { Ingredient } from '../menu/ingredient';
import { MenuItem } from '../menu/menu-item';
import { Modifier } from '../menu/modifier';
import { TaxRate } from '../menu/tax-rate';
import { Money } from '../money/money';
import { LineItem } from './line-item';
import { Order } from './order';
import { OrderOrigin } from './order-origin';
import {
  DuplicateLineItemIdError,
  EmptyOrderError,
  InvalidOrderStatusError,
  InvalidOrderTransitionError,
  LineItemNotFoundError,
  OrderNotEditableError,
} from './order.errors';
import { Quantity } from './quantity';

const OPENED_AT = new Date('2026-10-04T18:00:00.000Z');

function tacos(): MenuItem {
  return MenuItem.create({
    id: 'item-tacos',
    name: 'Tacos',
    price: Money.of(4500, 'MXN'),
    applicableTax: TaxRate.of(1600),
    ingredients: [
      Ingredient.of({ id: 'ing-tortilla', name: 'Tortilla' }),
      Ingredient.of({ id: 'ing-suadero', name: 'Suadero' }),
      Ingredient.of({ id: 'ing-cilantro', name: 'Cilantro' }),
    ],
    modifiers: [
      Modifier.extra({ id: 'mod-queso', name: 'Queso', price: Money.of(1500, 'MXN') }),
      Modifier.exclusion({ id: 'mod-cilantro', name: 'Cilantro' }),
    ],
  });
}

function line(id: string, modifierIds: string[] = []): LineItem {
  return LineItem.capture({
    id,
    menuItem: tacos(),
    quantity: Quantity.of(1),
    modifierIds,
  });
}

function openOrder(): Order {
  return Order.open({
    id: 'order-1',
    origin: OrderOrigin.table('5'),
    openedAt: OPENED_AT,
  });
}

function withStatus(
  status: 'SENT_TO_KITCHEN' | 'IN_KITCHEN' | 'READY' | 'CANCELLED',
  lines: LineItem[],
): Order {
  return Order.restore({
    id: 'order-1',
    origin: OrderOrigin.table('5'),
    status,
    openedAt: OPENED_AT,
    lines,
    version: 2,
  });
}

describe('Order', () => {
  it('opens with OPEN, no lines, version 0 and the given openedAt (OR1)', () => {
    const order = openOrder();

    expect(order.status).toBe('OPEN');
    expect(order.lines).toEqual([]);
    expect(order.version).toBe(0);
    expect(order.openedAt).toBe(OPENED_AT);
    expect(order.origin.tableId).toBe('5');
  });

  it('keeps two added lines in order (OR2)', () => {
    const order = openOrder().addLine(line('line-1')).addLine(line('line-2'));

    expect(order.lines.map((item) => item.id)).toEqual(['line-1', 'line-2']);
  });

  it('rejects addLine with a duplicate line id and leaves the order unchanged (OR3)', () => {
    const original = openOrder().addLine(line('line-1'));

    expect(() => original.addLine(line('line-1'))).toThrow(DuplicateLineItemIdError);
    expect(original.lines).toHaveLength(1);
    expect(original.lines[0]?.id).toBe('line-1');
  });

  it('replaceLine keeps the line in the same position (OR4)', () => {
    const first = line('line-1');
    const second = line('line-2', ['mod-queso']);
    const replaced = second.recapture({
      menuItem: tacos(),
      quantity: Quantity.of(3),
      modifierIds: ['mod-cilantro'],
    });

    const order = openOrder().addLine(first).addLine(second).replaceLine(replaced);

    expect(order.lines.map((item) => item.id)).toEqual(['line-1', 'line-2']);
    expect(order.lines[1]?.quantity.amount).toBe(3);
    expect(order.lines[1]?.modifiers[0]?.kind).toBe('exclusion');
  });

  it('rejects replaceLine of a missing id (OR5)', () => {
    const order = openOrder().addLine(line('line-1'));

    expect(() => order.replaceLine(line('line-missing'))).toThrow(LineItemNotFoundError);
  });

  it('rejects cancelLine of a missing id (OR5)', () => {
    const order = openOrder().addLine(line('line-1'));

    expect(() => order.cancelLine('line-missing')).toThrow(LineItemNotFoundError);
  });

  it('cancelLine of the only line leaves an OPEN empty order (OR6)', () => {
    const order = openOrder().addLine(line('line-1')).cancelLine('line-1');

    expect(order.status).toBe('OPEN');
    expect(order.lines).toEqual([]);
  });

  it('rejects sendToKitchen without lines (OR7)', () => {
    expect(() => openOrder().sendToKitchen()).toThrow(EmptyOrderError);
  });

  it('sendToKitchen with a line moves to SENT_TO_KITCHEN and keeps the lines (OR8)', () => {
    const withLine = openOrder().addLine(line('line-1'));
    const sent = withLine.sendToKitchen();

    expect(sent.status).toBe('SENT_TO_KITCHEN');
    expect(sent.lines.map((item) => item.id)).toEqual(['line-1']);
  });

  it('beginCooking moves SENT_TO_KITCHEN to IN_KITCHEN (OR8b)', () => {
    const order = withStatus('SENT_TO_KITCHEN', [line('line-1')]).beginCooking();

    expect(order.status).toBe('IN_KITCHEN');
    expect(order.lines.map((item) => item.id)).toEqual(['line-1']);
  });

  it('rejects addLine after send and while cooking (OR9)', () => {
    expect(() => withStatus('SENT_TO_KITCHEN', [line('line-1')]).addLine(line('line-2'))).toThrow(
      OrderNotEditableError,
    );
    expect(() => withStatus('IN_KITCHEN', [line('line-1')]).addLine(line('line-2'))).toThrow(
      OrderNotEditableError,
    );
  });

  it('rejects replaceLine after send (OR9)', () => {
    const existing = line('line-1');
    const order = withStatus('SENT_TO_KITCHEN', [existing]);

    expect(() =>
      order.replaceLine(
        existing.recapture({
          menuItem: tacos(),
          quantity: Quantity.of(2),
          modifierIds: [],
        }),
      ),
    ).toThrow(OrderNotEditableError);
  });

  it('rejects cancelLine after send (OR9)', () => {
    const order = withStatus('SENT_TO_KITCHEN', [line('line-1')]);

    expect(() => order.cancelLine('line-1')).toThrow(OrderNotEditableError);
  });

  it('rejects editing lines in READY (OR10)', () => {
    const order = withStatus('READY', [line('line-1')]);

    expect(() => order.addLine(line('line-2'))).toThrow(OrderNotEditableError);
    expect(() => order.replaceLine(line('line-1'))).toThrow(OrderNotEditableError);
    expect(() => order.cancelLine('line-1')).toThrow(OrderNotEditableError);
  });

  it('rejects editing lines in CANCELLED (OR10)', () => {
    const order = withStatus('CANCELLED', [line('line-1')]);

    expect(() => order.addLine(line('line-2'))).toThrow(OrderNotEditableError);
    expect(() => order.replaceLine(line('line-1'))).toThrow(OrderNotEditableError);
    expect(() => order.cancelLine('line-1')).toThrow(OrderNotEditableError);
  });

  it('rejects markReady from OPEN and SENT_TO_KITCHEN (OR11)', () => {
    expect(() => openOrder().addLine(line('line-1')).markReady()).toThrow(
      InvalidOrderTransitionError,
    );
    expect(() => withStatus('SENT_TO_KITCHEN', [line('line-1')]).markReady()).toThrow(
      InvalidOrderTransitionError,
    );
  });

  it('rejects beginCooking from OPEN (OR11b)', () => {
    expect(() => openOrder().addLine(line('line-1')).beginCooking()).toThrow(
      InvalidOrderTransitionError,
    );
  });

  it('cancel from SENT_TO_KITCHEN keeps the lines (OR12)', () => {
    const order = withStatus('SENT_TO_KITCHEN', [line('line-1'), line('line-2')]).cancel();

    expect(order.status).toBe('CANCELLED');
    expect(order.lines.map((item) => item.id)).toEqual(['line-1', 'line-2']);
  });

  it('rejects cancel once cooking has begun (OR12b)', () => {
    expect(() => withStatus('IN_KITCHEN', [line('line-1')]).cancel()).toThrow(
      InvalidOrderTransitionError,
    );
  });

  it('lists allowedActions for OPEN empty and with lines (OR13)', () => {
    expect(openOrder().allowedActions()).toEqual(['editLines', 'cancel']);
    expect(openOrder().addLine(line('line-1')).allowedActions()).toEqual([
      'editLines',
      'sendToKitchen',
      'cancel',
    ]);
  });

  it('lists allowedActions for SENT, cooking, READY, and CANCELLED (OR14)', () => {
    expect(withStatus('SENT_TO_KITCHEN', [line('line-1')]).allowedActions()).toEqual([
      'beginCooking',
      'cancel',
    ]);
    expect(withStatus('IN_KITCHEN', [line('line-1')]).allowedActions()).toEqual(['markReady']);
    expect(withStatus('READY', [line('line-1')]).allowedActions()).toEqual([]);
    expect(withStatus('CANCELLED', [line('line-1')]).allowedActions()).toEqual([]);
  });

  it('does not change version on any operation (OR15)', () => {
    const cooking = withStatus('IN_KITCHEN', [line('line-1')]);
    expect(cooking.version).toBe(2);
    expect(cooking.markReady().version).toBe(2);

    const sent = withStatus('SENT_TO_KITCHEN', [line('line-1')]);
    expect(sent.beginCooking().version).toBe(2);
    expect(sent.cancel().version).toBe(2);

    const open = openOrder().addLine(line('line-1'));
    expect(open.version).toBe(0);
    expect(open.sendToKitchen().version).toBe(0);
    expect(open.cancelLine('line-1').version).toBe(0);
    expect(
      open.replaceLine(
        line('line-1').recapture({
          menuItem: tacos(),
          quantity: Quantity.of(2),
          modifierIds: [],
        }),
      ).version,
    ).toBe(0);
  });

  it('rejects restore with an unknown status (OR16)', () => {
    expect(() =>
      Order.restore({
        id: 'order-1',
        origin: OrderOrigin.table('5'),
        status: 'COOKING',
        openedAt: OPENED_AT,
        lines: [],
        version: 0,
      }),
    ).toThrow(InvalidOrderStatusError);
  });

  it('rejects restore with duplicate line ids (OR16)', () => {
    expect(() =>
      Order.restore({
        id: 'order-1',
        origin: OrderOrigin.table('5'),
        status: 'OPEN',
        openedAt: OPENED_AT,
        lines: [line('line-1'), line('line-1')],
        version: 0,
      }),
    ).toThrow(DuplicateLineItemIdError);
  });
});

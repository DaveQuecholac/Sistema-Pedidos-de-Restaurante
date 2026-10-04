import { describe, expect, it } from 'vitest';
import type { MenuItemJson } from '../menu/menu-api';
import { OrderApiError, type LineItemJson, type OrderJson } from './order-api';
import {
  boardView,
  can,
  errorText,
  lockNotice,
  modifierLabel,
  openedAtLabel,
  orderableItems,
  originLabel,
  preselect,
  statusLabel,
} from './order-view';

function order(overrides: Partial<OrderJson> = {}): OrderJson {
  return {
    id: 'order-1',
    tableId: '5',
    externalOrderId: null,
    status: 'OPEN',
    openedAt: '2026-10-04T18:00:00.000Z',
    allowedActions: ['editLines', 'cancel'],
    lines: [],
    ...overrides,
  };
}

function line(overrides: Partial<LineItemJson> = {}): LineItemJson {
  return {
    id: 'line-1',
    menuItemId: 'item-tacos',
    name: 'Tacos',
    quantity: 2,
    unitPrice: { amount: 4500, currency: 'MXN' },
    applicableTax: { basisPoints: 1600 },
    modifiers: [
      {
        modifierId: 'mod-old-queso',
        name: 'Queso',
        kind: 'extra',
        price: { amount: 1500, currency: 'MXN' },
      },
    ],
    ...overrides,
  };
}

function menuItem(overrides: Partial<MenuItemJson> = {}): MenuItemJson {
  return {
    id: 'item-tacos',
    name: 'Tacos',
    price: { amount: 4500, currency: 'MXN' },
    applicableTax: { basisPoints: 1600 },
    active: true,
    ingredients: [{ id: 'ing-1', name: 'Cilantro' }],
    modifiers: [
      {
        id: 'mod-new-queso',
        name: 'Queso',
        kind: 'extra',
        price: { amount: 1500, currency: 'MXN' },
      },
      { id: 'mod-cilantro', name: 'Cilantro', kind: 'exclusion', price: null },
    ],
    ...overrides,
  };
}

describe('order view', () => {
  it('labels the order statuses (V1)', () => {
    expect(statusLabel('OPEN')).toBe('Abierta');
    expect(statusLabel('SENT_TO_KITCHEN')).toBe('En cocina');
    expect(statusLabel('IN_KITCHEN')).toBe('En cocción');
    expect(statusLabel('READY')).toBe('Lista');
    expect(statusLabel('CLOSED')).toBe('Cerrada');
    expect(statusLabel('CANCELLED')).toBe('Cancelada');
  });

  it('labels table and external origins (V2)', () => {
    expect(originLabel(order({ tableId: '5', externalOrderId: null }))).toBe('Mesa 5');
    expect(
      originLabel(order({ tableId: null, externalOrderId: 'UBER-1' })),
    ).toBe('Pedido externo UBER-1');
  });

  it('reads permissions from allowedActions (V3)', () => {
    const kitchen = order({
      status: 'IN_KITCHEN',
      allowedActions: ['markReady'],
    });

    expect(can(kitchen, 'editLines')).toBe(false);
    expect(can(kitchen, 'markReady')).toBe(true);
    expect(can(kitchen, 'cancel')).toBe(false);
  });

  it('shows a cooking lock notice and none when editable (V4)', () => {
    const cooking = order({
      status: 'IN_KITCHEN',
      allowedActions: ['markReady'],
    });
    const sent = order({
      status: 'SENT_TO_KITCHEN',
      allowedActions: ['beginCooking', 'cancel'],
    });
    const open = order({ status: 'OPEN', allowedActions: ['editLines', 'cancel'] });

    expect(lockNotice(cooking)).toMatch(/cocción/i);
    expect(lockNotice(sent)).toMatch(/envió a cocina/i);
    expect(lockNotice(open)).toBeNull();
  });

  it('labels extras with price and exclusions without (V5)', () => {
    expect(
      modifierLabel({
        modifierId: 'm1',
        name: 'Queso',
        kind: 'extra',
        price: { amount: 1500, currency: 'MXN' },
      }),
    ).toBe('+ Queso $15.00');
    expect(
      modifierLabel({
        modifierId: 'm2',
        name: 'Cilantro',
        kind: 'exclusion',
        price: null,
      }),
    ).toBe('sin Cilantro');
  });

  it('keeps only active menu items in order (V6)', () => {
    const inactive = menuItem({ id: 'item-flan', name: 'Flan', active: false, modifiers: [] });
    const activeFirst = menuItem({ id: 'item-a', name: 'Agua' });
    const activeSecond = menuItem({ id: 'item-b', name: 'Tacos' });

    expect(orderableItems([inactive, activeFirst, activeSecond]).map((item) => item.id)).toEqual([
      'item-a',
      'item-b',
    ]);
  });

  it('preselects modifiers by kind and name with the new id (V7)', () => {
    const result = preselect(line(), menuItem());

    expect(result.modifierIds).toEqual(['mod-new-queso']);
    expect(result.missing).toBe(false);
  });

  it('marks missing modifiers that left the catalog (V8)', () => {
    const result = preselect(
      line({
        modifiers: [
          {
            modifierId: 'gone',
            name: 'Salsa',
            kind: 'extra',
            price: { amount: 500, currency: 'MXN' },
          },
        ],
      }),
      menuItem(),
    );

    expect(result.modifierIds).toEqual([]);
    expect(result.missing).toBe(true);
  });

  it('translates known order error codes to Spanish (V9)', () => {
    expect(
      errorText(
        new OrderApiError(
          409,
          'Order lines cannot be edited in the current status',
          'OrderNotEditableError',
        ),
      ),
    ).toBe('La orden ya está en cocina. No se puede cambiar.');
    expect(
      errorText(
        new OrderApiError(409, 'External order id is already in use', 'ExternalOrderIdInUseError'),
      ),
    ).toBe('Ese pedido externo ya se registró.');
  });

  it('falls back to code: message for unknown codes (V10)', () => {
    expect(errorText(new OrderApiError(422, 'Something odd', 'WeirdError'))).toBe(
      'WeirdError: Something odd',
    );
  });

  it('shows only the message when there is no code (V11)', () => {
    expect(errorText(new OrderApiError(500, 'No se pudo contactar el API.', null))).toBe(
      'No se pudo contactar el API.',
    );
  });

  it('maps board loading, error, empty and list states (V12)', () => {
    expect(boardView({ kind: 'loading' })).toBe('loading');
    expect(boardView({ kind: 'error' })).toBe('error');
    expect(boardView({ kind: 'ready', orders: [] })).toBe('empty');
    expect(boardView({ kind: 'ready', orders: [order()] })).toBe('list');
  });

  it('formats openedAt in the given time zone (V13)', () => {
    expect(
      openedAtLabel(
        order({ openedAt: '2026-10-04T18:05:00.000Z' }),
        'America/Mexico_City',
      ),
    ).toBe('12:05');
  });
});

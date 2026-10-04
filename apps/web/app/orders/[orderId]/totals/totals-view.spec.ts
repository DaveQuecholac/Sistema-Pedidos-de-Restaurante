import { describe, expect, it } from 'vitest';
import { OrderApiError, type OrderJson } from '../../order-api';
import type { OrderTotalsJson } from './totals-api';
import {
  discountCapNotice,
  discountLabel,
  parseAdjustment,
  taxLabel,
  tipLabel,
  TIP_PRESETS,
  totalsErrorText,
  totalsView,
} from './totals-view';

function money(amount: number) {
  return { amount, currency: 'MXN' };
}

function totals(overrides: Partial<OrderTotalsJson> = {}): OrderTotalsJson {
  return {
    orderId: 'order-1',
    currency: 'MXN',
    adjustable: true,
    lines: [],
    subtotal: money(14500),
    discount: null,
    taxes: [],
    taxTotal: money(1920),
    tip: null,
    total: money(16420),
    ...overrides,
  };
}

function order(): OrderJson {
  return {
    id: 'order-1',
    tableId: '5',
    externalOrderId: null,
    status: 'OPEN',
    openedAt: '2026-10-04T18:00:00.000Z',
    allowedActions: ['editLines', 'cancel'],
    lines: [],
  };
}

describe('totals view', () => {
  it('labels tax rates (V14)', () => {
    expect(taxLabel({ basisPoints: 1600 })).toBe('Impuesto 16.00 %');
    expect(taxLabel({ basisPoints: 0 })).toBe('Impuesto 0.00 %');
  });

  it('labels discounts (V15)', () => {
    expect(
      discountLabel({ kind: 'percentage', basisPoints: 1000, amount: money(1450) }),
    ).toBe('Descuento 10.00 %');
    expect(
      discountLabel({ kind: 'fixedAmount', requested: money(5000), amount: money(5000) }),
    ).toBe('Descuento (monto fijo)');
  });

  it('labels tips (V16)', () => {
    expect(tipLabel({ kind: 'percentage', basisPoints: 1500, amount: money(1958) })).toBe(
      'Propina 15.00 %',
    );
    expect(tipLabel({ kind: 'fixedAmount', amount: money(2000) })).toBe('Propina (monto fijo)');
  });

  it('notices a capped fixed discount and ignores equal amounts (V17)', () => {
    expect(
      discountCapNotice(
        totals({
          discount: {
            kind: 'fixedAmount',
            requested: money(20000),
            amount: money(14500),
          },
        }),
      ),
    ).toBe('El descuento se ajustó al subtotal.');

    expect(
      discountCapNotice(
        totals({
          discount: {
            kind: 'fixedAmount',
            requested: money(5000),
            amount: money(5000),
          },
        }),
      ),
    ).toBeNull();
  });

  it('parses percentage adjustments (V18)', () => {
    expect(parseAdjustment('percentage', '10')).toEqual({
      ok: true,
      value: { kind: 'percentage', basisPoints: 1000 },
    });
    expect(parseAdjustment('percentage', '10.5')).toEqual({
      ok: true,
      value: { kind: 'percentage', basisPoints: 1050 },
    });
  });

  it('parses fixed-amount adjustments (V19)', () => {
    expect(parseAdjustment('fixedAmount', '50')).toEqual({
      ok: true,
      value: { kind: 'fixedAmount', amount: 5000 },
    });
    expect(parseAdjustment('fixedAmount', '50.25')).toEqual({
      ok: true,
      value: { kind: 'fixedAmount', amount: 5025 },
    });
  });

  it('rejects invalid adjustment text without a body (V20)', () => {
    for (const text of ['', 'abc', '10.123', '-5']) {
      const result = parseAdjustment('percentage', text);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message.length).toBeGreaterThan(0);
        expect(result).not.toHaveProperty('value');
      }
    }
  });

  it('exposes tip presets (V21)', () => {
    expect(TIP_PRESETS).toEqual([1000, 1500, 2000]);
  });

  it('maps totals-specific API codes (V22)', () => {
    expect(
      totalsErrorText(new OrderApiError(409, 'x', 'OrderTotalsNotAdjustableError')),
    ).toBe('La cuenta ya no se puede ajustar.');
    expect(totalsErrorText(new OrderApiError(422, 'x', 'InvalidPercentageError'))).toBe(
      'El porcentaje tiene que ser de 0.01 a 100.',
    );
    expect(totalsErrorText(new OrderApiError(422, 'x', 'InvalidDiscountError'))).toBe(
      'El descuento tiene que ser mayor que cero.',
    );
    expect(totalsErrorText(new OrderApiError(422, 'x', 'InvalidTipError'))).toBe(
      'La propina tiene que ser mayor que cero.',
    );
    expect(totalsErrorText(new OrderApiError(422, 'x', 'InvalidMoneyError'))).toBe(
      'El monto no es válido.',
    );
    expect(totalsErrorText(new OrderApiError(422, 'x', 'MoneyOverflowError'))).toBe(
      'La cuenta supera el monto máximo que se puede registrar.',
    );
  });

  it('reuses order errorText for concurrency and unknown codes (V23)', () => {
    expect(totalsErrorText(new OrderApiError(409, 'x', 'OrderConcurrencyError'))).toBe(
      'Otra persona cambió esta orden. Se recargó con lo último.',
    );
    expect(totalsErrorText(new OrderApiError(500, 'boom', 'WeirdDomainError'))).toBe(
      'WeirdDomainError: boom',
    );
  });

  it('maps load states to view kinds (V24)', () => {
    expect(totalsView({ kind: 'loading' })).toBe('loading');
    expect(totalsView({ kind: 'error', error: new Error('x') })).toBe('error');
    expect(totalsView({ kind: 'missing' })).toBe('missing');
    expect(totalsView({ kind: 'ready', order: order(), totals: totals() })).toBe('ready');
  });
});

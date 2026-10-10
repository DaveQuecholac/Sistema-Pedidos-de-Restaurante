import { describe, expect, it } from 'vitest';
import { OrderApiError, type OrderJson } from '../../order-api';
import type { OrderTotalsJson } from '../cuenta/totals-api';
import type { PaymentJson } from './payment-api';
import {
  PAYMENT_METHODS,
  confirmationText,
  parsePaymentInput,
  paymentErrorText,
  paymentView,
  receiptRows,
  type PaymentStatus,
} from './payment-view';

function money(amount: number) {
  return { amount, currency: 'MXN' };
}

function order(overrides: Partial<OrderJson> = {}): OrderJson {
  return {
    id: 'order-1',
    tableId: '5',
    externalOrderId: null,
    status: 'READY',
    openedAt: '2026-10-04T18:00:00.000Z',
    allowedActions: ['close'],
    lines: [],
    ...overrides,
  };
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

function cashPayment(overrides: Partial<PaymentJson> = {}): PaymentJson {
  return {
    id: 'pay-1',
    method: 'cash',
    amount: money(16420),
    tendered: money(20000),
    change: money(3580),
    cardLast4: null,
    payerReference: null,
    reference: 'cash-r1',
    paidAt: '2026-10-04T18:00:00.000Z',
    ...overrides,
  };
}

function readyState(overrides: Partial<Extract<PaymentStatus, { kind: 'ready' }>> = {}): PaymentStatus {
  return {
    kind: 'ready',
    order: order(),
    totals: totals(),
    payment: null,
    ...overrides,
  };
}

describe('payment view', () => {
  it('lists the three payment methods in order (V25)', () => {
    expect(PAYMENT_METHODS.map((entry) => [entry.method, entry.label])).toEqual([
      ['cash', 'Efectivo'],
      ['card', 'Tarjeta'],
      ['digitalGateway', 'Pasarela digital'],
    ]);
  });

  it('parses cash amounts to centavos (V26)', () => {
    expect(parsePaymentInput('cash', '200')).toEqual({
      ok: true,
      value: { method: 'cash', tendered: 20000 },
    });
    expect(parsePaymentInput('cash', '164.20')).toEqual({
      ok: true,
      value: { method: 'cash', tendered: 16420 },
    });
  });

  it('rejects invalid cash text without a body (V27)', () => {
    for (const text of ['', 'abc', '-5', '10.123']) {
      const result = parsePaymentInput('cash', text);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message.length).toBeGreaterThan(0);
      }
    }
  });

  it('parses card last4 with trim (V28)', () => {
    expect(parsePaymentInput('card', '4242')).toEqual({
      ok: true,
      value: { method: 'card', cardLast4: '4242' },
    });
    expect(parsePaymentInput('card', ' 4242 ')).toEqual({
      ok: true,
      value: { method: 'card', cardLast4: '4242' },
    });
  });

  it('rejects invalid card last4 (V29)', () => {
    for (const text of ['424', '42424', 'abcd']) {
      const result = parsePaymentInput('card', text);
      expect(result.ok).toBe(false);
    }
  });

  it('parses gateway references and rejects short ones (V30)', () => {
    expect(parsePaymentInput('digitalGateway', 'cliente@correo.mx')).toEqual({
      ok: true,
      value: { method: 'digitalGateway', payerReference: 'cliente@correo.mx' },
    });
    expect(parsePaymentInput('digitalGateway', '').ok).toBe(false);
    expect(parsePaymentInput('digitalGateway', 'ab').ok).toBe(false);
  });

  it('builds confirmation text for cash and card (V31)', () => {
    expect(
      confirmationText('cash', money(16420), { method: 'cash', tendered: 20000 }),
    ).toBe('Cobrar $164.20 con Efectivo · Recibido $200.00');
    expect(
      confirmationText('card', money(16420), { method: 'card', cardLast4: '4242' }),
    ).toBe('Cobrar $164.20 con Tarjeta •••• 4242');
  });

  it('shows change from the server payment on cash receipts (V32)', () => {
    const rows = receiptRows(cashPayment());
    const text = rows.map((row) => `${row.label} ${row.value}`).join(' | ');
    expect(text).toContain('Cambio $35.80');
    expect(text).toContain('Recibido $200.00');
    expect(text).toContain('Total $164.20');
  });

  it('shows card and gateway details without cash rows (V33)', () => {
    const card = receiptRows(
      cashPayment({
        method: 'card',
        tendered: null,
        change: null,
        cardLast4: '4242',
        reference: 'card-r1',
      }),
    );
    const cardText = card.map((row) => row.value).join(' | ');
    expect(cardText).toContain('Tarjeta •••• 4242');
    expect(cardText).not.toMatch(/Recibido|Cambio/);

    const gateway = receiptRows(
      cashPayment({
        method: 'digitalGateway',
        tendered: null,
        change: null,
        cardLast4: null,
        payerReference: 'cliente@correo.mx',
        reference: 'gateway-r1',
      }),
    );
    const gatewayText = gateway.map((row) => row.value).join(' | ');
    expect(gatewayText).toContain('cliente@correo.mx');
    expect(gatewayText).not.toMatch(/Recibido|Cambio/);
  });

  it('maps payment error codes to Spanish copy (V34)', () => {
    const cases: Array<[string, string]> = [
      ['PaymentDeclinedError', 'El cobro fue rechazado. Prueba con otra tarjeta o con otro medio.'],
      [
        'PaymentProcessorUnavailableError',
        'El procesador de pagos no respondió. No se cobró nada; intenta de nuevo.',
      ],
      ['PaymentMethodUnavailableError', 'Ese medio de pago no está disponible.'],
      [
        'PaymentAmountMismatchError',
        'La cuenta cambió mientras cobrabas. Revisa el total nuevo.',
      ],
      ['OrderNotClosableError', 'Esta orden no se puede cobrar en su estado actual.'],
      ['InsufficientCashError', 'El monto recibido no alcanza para el total.'],
      ['InvalidCardLast4Error', 'Escribe los últimos 4 dígitos de la tarjeta.'],
      [
        'InvalidPayerReferenceError',
        'Escribe el correo o teléfono del cliente (3 a 64 caracteres).',
      ],
      ['InvalidPaymentMethodError', 'Elige un medio de pago.'],
      ['PaymentVoidFailedError', 'Hubo un cargo que no se pudo anular. Avisa al encargado.'],
    ];

    for (const [code, text] of cases) {
      expect(paymentErrorText(new OrderApiError(422, 'x', code))).toBe(text);
    }
  });

  it('uses can(close) for payable, not status alone (V35)', () => {
    expect(
      paymentView(
        readyState({
          order: order({ status: 'READY', allowedActions: ['close'] }),
        }),
      ),
    ).toBe('payable');

    expect(
      paymentView(
        readyState({
          order: order({ status: 'READY', allowedActions: [] }),
        }),
      ),
    ).toBe('notReady');
  });

  it('maps load and order states (V36)', () => {
    expect(paymentView({ kind: 'loading' })).toBe('loading');
    expect(paymentView({ kind: 'error', error: new Error('x') })).toBe('error');
    expect(paymentView({ kind: 'missing' })).toBe('missing');
    expect(
      paymentView(
        readyState({
          order: order({ status: 'CANCELLED', allowedActions: [] }),
        }),
      ),
    ).toBe('cancelled');
    expect(
      paymentView(
        readyState({
          order: order({ status: 'OPEN', allowedActions: ['editLines', 'cancel'] }),
        }),
      ),
    ).toBe('notReady');
    expect(
      paymentView(
        readyState({
          order: order({ status: 'CLOSED', allowedActions: [] }),
          payment: cashPayment(),
        }),
      ),
    ).toBe('closed');
  });
});

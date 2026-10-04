import { describe, expect, it } from 'vitest';
import { Money } from '../money/money';
import { ChargeRequest } from './charge-request';
import { PaymentDetails } from './payment-details';
import { Payment } from './payment';
import { InsufficientCashError, InvalidPaymentReferenceError } from './payment.errors';

describe('Payment', () => {
  const paidAt = new Date('2026-10-04T18:00:00Z');
  const total = Money.of(16420, 'MXN');

  function cashRequest(tendered: number, amount = total): ChargeRequest {
    return ChargeRequest.of({
      orderId: 'order-1',
      amount,
      details: PaymentDetails.cash(Money.of(tendered, 'MXN')),
    });
  }

  it('records cash with change (PY1)', () => {
    const payment = Payment.record({
      id: 'pay-1',
      request: cashRequest(20000),
      reference: 'cash-1',
      paidAt,
    });
    expect(payment.amount.amount).toBe(16420);
    expect(payment.method).toBe('cash');
    expect(payment.change?.amount).toBe(3580);
    expect(payment.reference).toBe('cash-1');
    expect(payment.paidAt).toBe(paidAt);
  });

  it('records exact cash with zero change (PY2)', () => {
    const payment = Payment.record({
      id: 'pay-1',
      request: cashRequest(16420),
      reference: 'cash-1',
      paidAt,
    });
    expect(payment.change?.amount).toBe(0);
  });

  it('records card with null change (PY3)', () => {
    const payment = Payment.record({
      id: 'pay-1',
      request: ChargeRequest.of({
        orderId: 'order-1',
        amount: total,
        details: PaymentDetails.card('4242'),
      }),
      reference: 'card-1',
      paidAt,
    });
    expect(payment.change).toBeNull();
    if (payment.details.method === 'card') {
      expect(payment.details.cardLast4).toBe('4242');
    }
  });

  it('rejects invalid payment references (PY4)', () => {
    const request = cashRequest(20000);
    expect(() =>
      Payment.record({ id: 'pay-1', request, reference: '', paidAt }),
    ).toThrow(InvalidPaymentReferenceError);
    expect(() =>
      Payment.record({ id: 'pay-1', request, reference: '  ', paidAt }),
    ).toThrow(InvalidPaymentReferenceError);
    expect(() =>
      Payment.record({ id: 'pay-1', request, reference: 'x'.repeat(65), paidAt }),
    ).toThrow(InvalidPaymentReferenceError);
  });

  it('restores the same fields as record (PY5)', () => {
    const recorded = Payment.record({
      id: 'pay-1',
      request: cashRequest(20000),
      reference: 'cash-1',
      paidAt,
    });
    const restored = Payment.restore({
      id: recorded.id,
      amount: recorded.amount,
      details: recorded.details,
      reference: recorded.reference,
      paidAt: recorded.paidAt,
    });
    expect(restored.id).toBe(recorded.id);
    expect(restored.amount.equals(recorded.amount)).toBe(true);
    expect(restored.details).toEqual(recorded.details);
    expect(restored.reference).toBe(recorded.reference);
    expect(restored.paidAt).toBe(recorded.paidAt);
    expect(restored.method).toBe(recorded.method);
    expect(restored.change?.amount).toBe(3580);
  });

  it('rejects restore when cash tendered is below amount (PY6)', () => {
    expect(() =>
      Payment.restore({
        id: 'pay-1',
        amount: total,
        details: PaymentDetails.cash(Money.of(16000, 'MXN')),
        reference: 'cash-1',
        paidAt,
      }),
    ).toThrow(InsufficientCashError);
  });

  it('computes change for L+ total 16083 (PY7)', () => {
    const payment = Payment.record({
      id: 'pay-1',
      request: cashRequest(20000, Money.of(16083, 'MXN')),
      reference: 'cash-1',
      paidAt,
    });
    expect(payment.change?.amount).toBe(3917);
  });
});

import { describe, expect, it } from 'vitest';
import { Money } from '../money/money';
import { ChargeRequest } from './charge-request';
import { PaymentDetails } from './payment-details';
import { InsufficientCashError } from './payment.errors';

describe('ChargeRequest', () => {
  const orderId = 'order-1';
  const total = Money.of(16420, 'MXN');

  it('accepts cash above the total (CR1)', () => {
    const request = ChargeRequest.of({
      orderId,
      amount: total,
      details: PaymentDetails.cash(Money.of(20000, 'MXN')),
    });
    expect(request.method).toBe('cash');
    expect(request.amount.amount).toBe(16420);
    expect(request.orderId).toBe(orderId);
  });

  it('accepts cash equal to the total (CR2)', () => {
    const request = ChargeRequest.of({
      orderId,
      amount: total,
      details: PaymentDetails.cash(Money.of(16420, 'MXN')),
    });
    expect(request.amount.amount).toBe(16420);
    if (request.details.method === 'cash') {
      expect(request.details.tendered.amount).toBe(16420);
    }
  });

  it('rejects cash below the total (CR3)', () => {
    expect(() =>
      ChargeRequest.of({
        orderId,
        amount: total,
        details: PaymentDetails.cash(Money.of(16000, 'MXN')),
      }),
    ).toThrow(InsufficientCashError);
  });

  it('accepts card and gateway for a positive total and for zero (CR4)', () => {
    const zero = Money.zero('MXN');
    expect(
      ChargeRequest.of({
        orderId,
        amount: total,
        details: PaymentDetails.card('4242'),
      }).method,
    ).toBe('card');
    expect(
      ChargeRequest.of({
        orderId,
        amount: total,
        details: PaymentDetails.digitalGateway('cliente@correo.mx'),
      }).method,
    ).toBe('digitalGateway');
    expect(
      ChargeRequest.of({
        orderId,
        amount: zero,
        details: PaymentDetails.card('4242'),
      }).amount.amount,
    ).toBe(0);
    expect(
      ChargeRequest.of({
        orderId,
        amount: zero,
        details: PaymentDetails.digitalGateway('cliente@correo.mx'),
      }).amount.amount,
    ).toBe(0);
  });

  it('accepts cash zero for a zero total (CR5)', () => {
    const request = ChargeRequest.of({
      orderId,
      amount: Money.zero('MXN'),
      details: PaymentDetails.cash(Money.zero('MXN')),
    });
    expect(request.amount.amount).toBe(0);
    if (request.details.method === 'cash') {
      expect(request.details.tendered.amount).toBe(0);
    }
  });
});

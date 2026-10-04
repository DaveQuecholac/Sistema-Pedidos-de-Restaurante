import { describe, expect, it } from 'vitest';
import { Money } from '../money/money';
import { PaymentDetails } from './payment-details';
import { InvalidCardLast4Error, InvalidPayerReferenceError } from './payment.errors';

describe('PaymentDetails', () => {
  it('builds cash details (PD1)', () => {
    const tendered = Money.of(20000, 'MXN');
    const details = PaymentDetails.cash(tendered);
    expect(details.method).toBe('cash');
    if (details.method === 'cash') {
      expect(details.tendered).toBe(tendered);
      expect(details.tendered.amount).toBe(20000);
    }
  });

  it('accepts four-digit card last4 as text (PD2)', () => {
    expect(PaymentDetails.card('4242')).toEqual({ method: 'card', cardLast4: '4242' });
    expect(PaymentDetails.card('0000')).toEqual({ method: 'card', cardLast4: '0000' });
  });

  it('rejects invalid card last4 values (PD3)', () => {
    expect(() => PaymentDetails.card('424')).toThrow(InvalidCardLast4Error);
    expect(() => PaymentDetails.card('42424')).toThrow(InvalidCardLast4Error);
    expect(() => PaymentDetails.card('abcd')).toThrow(InvalidCardLast4Error);
    expect(() => PaymentDetails.card('42 4')).toThrow(InvalidCardLast4Error);
    expect(() => PaymentDetails.card(4242)).toThrow(InvalidCardLast4Error);
  });

  it('trims payer reference (PD4)', () => {
    expect(PaymentDetails.digitalGateway('  cliente@correo.mx  ')).toEqual({
      method: 'digitalGateway',
      payerReference: 'cliente@correo.mx',
    });
  });

  it('rejects invalid payer references (PD5)', () => {
    expect(() => PaymentDetails.digitalGateway('')).toThrow(InvalidPayerReferenceError);
    expect(() => PaymentDetails.digitalGateway('  ')).toThrow(InvalidPayerReferenceError);
    expect(() => PaymentDetails.digitalGateway('ab')).toThrow(InvalidPayerReferenceError);
    expect(() => PaymentDetails.digitalGateway('x'.repeat(65))).toThrow(InvalidPayerReferenceError);
    expect(() => PaymentDetails.digitalGateway(42)).toThrow(InvalidPayerReferenceError);
  });

  it('returns a readonly payment details object (PD6)', () => {
    const details = PaymentDetails.card('4242');
    expect(() => {
      (details as { cardLast4: string }).cardLast4 = '9999';
    }).toThrow();
    expect(details).toEqual({ method: 'card', cardLast4: '4242' });
  });
});

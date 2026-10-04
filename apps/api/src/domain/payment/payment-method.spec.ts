import { describe, expect, it } from 'vitest';
import { isPaymentMethod } from './payment-method';

describe('isPaymentMethod', () => {
  it('accepts cash, card and digitalGateway (PM1)', () => {
    expect(isPaymentMethod('cash')).toBe(true);
    expect(isPaymentMethod('card')).toBe(true);
    expect(isPaymentMethod('digitalGateway')).toBe(true);
  });

  it('rejects unknown values (PM2)', () => {
    expect(isPaymentMethod('coupon')).toBe(false);
    expect(isPaymentMethod('')).toBe(false);
    expect(isPaymentMethod(null)).toBe(false);
    expect(isPaymentMethod(1)).toBe(false);
  });
});

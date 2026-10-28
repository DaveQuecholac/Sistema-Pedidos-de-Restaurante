import { describe, expect, it } from 'vitest';
import { Money } from '../money/money';
import { Discount } from './discount';
import { Percentage } from './percentage';
import { InvalidDiscountError } from './totals.errors';

describe('Discount', () => {
  const subtotal = Money.of(14500, 'MXN');
  const zero = Money.zero('MXN');

  it('applies a 10 percent discount (DS1)', () => {
    const discount = Discount.percentage(Percentage.of(1000));
    expect(discount.amountFor(subtotal).amount).toBe(1450);
  });

  it('applies a 3.33 percent discount with half-up rounding (DS2)', () => {
    const discount = Discount.percentage(Percentage.of(333));
    expect(discount.amountFor(subtotal).amount).toBe(483);
  });

  it('applies a fixed discount under the subtotal (DS3)', () => {
    const discount = Discount.fixedAmount(Money.of(5000, 'MXN'));
    expect(discount.amountFor(subtotal).amount).toBe(5000);
  });

  it('caps a fixed discount at the subtotal (DS4)', () => {
    const discount = Discount.fixedAmount(Money.of(20000, 'MXN'));
    expect(discount.amountFor(subtotal).amount).toBe(14500);
  });

  it('returns zero for any discount on a zero subtotal (DS5)', () => {
    expect(Discount.percentage(Percentage.of(1000)).amountFor(zero).amount).toBe(0);
    expect(Discount.fixedAmount(Money.of(5000, 'MXN')).amountFor(zero).amount).toBe(0);
  });

  it('rejects a fixed discount of zero (DS6)', () => {
    expect(() => Discount.fixedAmount(Money.zero('MXN'))).toThrow(InvalidDiscountError);
  });

  it('exposes the kind of each variant (DS7)', () => {
    expect(Discount.percentage(Percentage.of(1000)).kind).toBe('percentage');
    expect(Discount.fixedAmount(Money.of(5000, 'MXN')).kind).toBe('fixedAmount');
  });
});

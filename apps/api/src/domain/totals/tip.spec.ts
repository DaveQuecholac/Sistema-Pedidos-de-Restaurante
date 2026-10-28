import { describe, expect, it } from 'vitest';
import { Money } from '../money/money';
import { Percentage } from './percentage';
import { Tip } from './tip';
import { InvalidTipError } from './totals.errors';

describe('Tip', () => {
  const base = Money.of(13050, 'MXN');
  const zero = Money.zero('MXN');

  it('applies a 10 percent tip (TP1)', () => {
    const tip = Tip.percentage(Percentage.of(1000));
    expect(tip.amountFor(base).amount).toBe(1305);
  });

  it('applies a 15 percent tip with half-up rounding (TP2)', () => {
    const tip = Tip.percentage(Percentage.of(1500));
    expect(tip.amountFor(base).amount).toBe(1958);
  });

  it('applies a fixed tip even on a zero base (TP3)', () => {
    const tip = Tip.fixedAmount(Money.of(2000, 'MXN'));
    expect(tip.amountFor(base).amount).toBe(2000);
    expect(tip.amountFor(zero).amount).toBe(2000);
  });

  it('returns zero for a percentage tip on a zero base (TP4)', () => {
    expect(Tip.percentage(Percentage.of(1000)).amountFor(zero).amount).toBe(0);
  });

  it('rejects a fixed tip of zero (TP5)', () => {
    expect(() => Tip.fixedAmount(Money.zero('MXN'))).toThrow(InvalidTipError);
  });

  it('exposes the kind of each variant (TP6)', () => {
    expect(Tip.percentage(Percentage.of(1000)).kind).toBe('percentage');
    expect(Tip.fixedAmount(Money.of(2000, 'MXN')).kind).toBe('fixedAmount');
  });
});

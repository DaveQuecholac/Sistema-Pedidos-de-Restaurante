import { describe, expect, it } from 'vitest';
import { InvalidMoneyError, Money } from './money';

describe('Money', () => {
  it('accepts 4500 MXN (M1)', () => {
    const money = Money.of(4500, 'MXN');

    expect(money.amount).toBe(4500);
    expect(money.currency).toBe('MXN');
  });

  it('accepts amount 0 in MXN (M2)', () => {
    const money = Money.of(0, 'MXN');

    expect(money.amount).toBe(0);
    expect(money.currency).toBe('MXN');
  });

  it('accepts the largest PostgreSQL integer in MXN (M3)', () => {
    const money = Money.of(2_147_483_647, 'MXN');

    expect(money.amount).toBe(2_147_483_647);
    expect(money.currency).toBe('MXN');
  });

  it('rejects one unit past the PostgreSQL integer limit (M4)', () => {
    expect(() => Money.of(2_147_483_648, 'MXN')).toThrow(InvalidMoneyError);
  });

  it('rejects negative, fractional, NaN, and infinite amounts (M5)', () => {
    for (const amount of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => Money.of(amount, 'MXN')).toThrow(InvalidMoneyError);
    }
  });

  it('rejects currencies other than MXN (M6)', () => {
    for (const currency of ['mxn', 'USD', 'MX', 'MXNX', '']) {
      expect(() => Money.of(4500, currency)).toThrow(InvalidMoneyError);
    }
  });
});

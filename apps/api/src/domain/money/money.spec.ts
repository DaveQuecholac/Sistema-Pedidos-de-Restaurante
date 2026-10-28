import { describe, expect, it } from 'vitest';
import {
  InvalidAllocationError,
  InvalidMoneyError,
  InvalidMultiplierError,
  Money,
  MoneyOverflowError,
  NegativeMoneyError,
} from './money';

describe('Money', () => {
  it('accepts 4500 MXN (M1 / MN10)', () => {
    const money = Money.of(4500, 'MXN');

    expect(money.amount).toBe(4500);
    expect(money.currency).toBe('MXN');
  });

  it('accepts amount 0 in MXN (M2 / MN10)', () => {
    const money = Money.of(0, 'MXN');

    expect(money.amount).toBe(0);
    expect(money.currency).toBe('MXN');
  });

  it('accepts the largest PostgreSQL integer in MXN (M3 / MN10)', () => {
    const money = Money.of(2_147_483_647, 'MXN');

    expect(money.amount).toBe(2_147_483_647);
    expect(money.currency).toBe('MXN');
  });

  it('rejects one unit past the PostgreSQL integer limit (M4 / MN10)', () => {
    expect(() => Money.of(2_147_483_648, 'MXN')).toThrow(InvalidMoneyError);
  });

  it('rejects negative, fractional, NaN, and infinite amounts (M5 / MN10)', () => {
    for (const amount of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => Money.of(amount, 'MXN')).toThrow(InvalidMoneyError);
    }
  });

  it('rejects currencies other than MXN (M6 / MN10)', () => {
    for (const currency of ['mxn', 'USD', 'MX', 'MXNX', '']) {
      expect(() => Money.of(4500, currency)).toThrow(InvalidMoneyError);
    }
  });

  it('adds two amounts without mutating the originals (MN1)', () => {
    const left = Money.of(4500, 'MXN');
    const right = Money.of(1500, 'MXN');

    const sum = left.add(right);

    expect(sum.amount).toBe(6000);
    expect(left.amount).toBe(4500);
    expect(right.amount).toBe(1500);
  });

  it('multiplies by integer including zero (MN2)', () => {
    const base = Money.of(6000, 'MXN');

    expect(base.times(2).amount).toBe(12000);
    expect(base.times(0).amount).toBe(0);
  });

  it('rejects non-integer multipliers (MN3)', () => {
    const base = Money.of(6000, 'MXN');

    for (const multiplier of [1.5, -1, Number.NaN]) {
      expect(() => base.times(multiplier)).toThrow(InvalidMultiplierError);
    }
  });

  it('subtracts or rejects a negative result (MN4)', () => {
    expect(Money.of(14500, 'MXN').subtract(Money.of(1450, 'MXN')).amount).toBe(13050);
    expect(() => Money.of(100, 'MXN').subtract(Money.of(101, 'MXN'))).toThrow(NegativeMoneyError);
  });

  it('applies half-up percentage with BigInt (MN5)', () => {
    expect(Money.of(25, 'MXN').percentage(1000).amount).toBe(3);
    expect(Money.of(3, 'MXN').percentage(1600).amount).toBe(0);
    expect(Money.of(1, 'MXN').percentage(5000).amount).toBe(1);
    expect(Money.of(14500, 'MXN').percentage(333).amount).toBe(483);
    expect(Money.of(13050, 'MXN').percentage(1500).amount).toBe(1958);
  });

  it('keeps the max amount exact at 100 percent (MN6)', () => {
    expect(Money.of(2_147_483_647, 'MXN').percentage(10000).amount).toBe(2_147_483_647);
  });

  it('allocates by largest remainder (MN7)', () => {
    expect(
      Money.of(5000, 'MXN')
        .allocate([12000, 2500])
        .map((part) => part.amount),
    ).toEqual([4138, 862]);
    expect(
      Money.of(1450, 'MXN')
        .allocate([12000, 2500])
        .map((part) => part.amount),
    ).toEqual([1200, 250]);
  });

  it('handles ties, zero amount, and all-zero weights (MN8)', () => {
    expect(
      Money.of(1, 'MXN')
        .allocate([1000, 1000])
        .map((part) => part.amount),
    ).toEqual([1, 0]);
    expect(
      Money.of(0, 'MXN')
        .allocate([0, 0])
        .map((part) => part.amount),
    ).toEqual([0, 0]);
    expect(() => Money.of(1, 'MXN').allocate([0, 0])).toThrow(InvalidAllocationError);
  });

  it('rejects overflow on add and times (MN9)', () => {
    expect(() => Money.of(2_147_483_647, 'MXN').add(Money.of(1, 'MXN'))).toThrow(
      MoneyOverflowError,
    );
    expect(() => Money.of(2_000_000_000, 'MXN').times(2)).toThrow(MoneyOverflowError);
  });
});

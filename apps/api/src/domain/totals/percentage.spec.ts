import { describe, expect, it } from 'vitest';
import { Percentage } from './percentage';
import { InvalidPercentageError } from './totals.errors';

describe('Percentage', () => {
  it('accepts the minimum and maximum basis points (PC1)', () => {
    expect(Percentage.of(1).basisPoints).toBe(1);
    expect(Percentage.of(10000).basisPoints).toBe(10000);
  });

  it('rejects zero, above 10000, and negative values (PC2)', () => {
    for (const basisPoints of [0, 10001, -1]) {
      expect(() => Percentage.of(basisPoints)).toThrow(InvalidPercentageError);
    }
  });

  it('rejects fractional, NaN, and string values from untyped input (PC3)', () => {
    expect(() => Percentage.of(10.5)).toThrow(InvalidPercentageError);
    expect(() => Percentage.of(Number.NaN)).toThrow(InvalidPercentageError);
    expect(() => Percentage.of('10' as unknown as number)).toThrow(InvalidPercentageError);
  });
});

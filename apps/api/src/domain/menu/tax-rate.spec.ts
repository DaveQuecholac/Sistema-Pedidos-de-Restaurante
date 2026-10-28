import { describe, expect, it } from 'vitest';
import { InvalidTaxRateError, TaxRate } from './tax-rate';

describe('TaxRate', () => {
  it('accepts 1600 basis points (T1)', () => {
    expect(TaxRate.of(1600).basisPoints).toBe(1600);
  });

  it('accepts 0 and the largest PostgreSQL integer (T2)', () => {
    expect(TaxRate.of(0).basisPoints).toBe(0);
    expect(TaxRate.of(2_147_483_647).basisPoints).toBe(2_147_483_647);
  });

  it('rejects negative, fractional, NaN, and out-of-range basis points (T3)', () => {
    for (const basisPoints of [-1, 1600.5, Number.NaN, 2_147_483_648]) {
      expect(() => TaxRate.of(basisPoints)).toThrow(InvalidTaxRateError);
    }
  });
});

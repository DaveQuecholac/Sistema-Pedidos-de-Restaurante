import { describe, expect, it } from 'vitest';
import { InvalidQuantityError } from './order.errors';
import { Quantity } from './quantity';

describe('Quantity', () => {
  it('accepts 1 and 99 (Q1)', () => {
    expect(Quantity.of(1).amount).toBe(1);
    expect(Quantity.of(99).amount).toBe(99);
  });

  it('rejects 0 (Q2)', () => {
    expect(() => Quantity.of(0)).toThrow(InvalidQuantityError);
  });

  it('rejects 100 (Q2)', () => {
    expect(() => Quantity.of(100)).toThrow(InvalidQuantityError);
  });

  it('rejects -1 (Q2)', () => {
    expect(() => Quantity.of(-1)).toThrow(InvalidQuantityError);
  });

  it('rejects 1.5 (Q3)', () => {
    expect(() => Quantity.of(1.5)).toThrow(InvalidQuantityError);
  });

  it('rejects NaN (Q3)', () => {
    expect(() => Quantity.of(Number.NaN)).toThrow(InvalidQuantityError);
  });

  it('rejects Infinity (Q3)', () => {
    expect(() => Quantity.of(Number.POSITIVE_INFINITY)).toThrow(InvalidQuantityError);
  });

  it('rejects a string that would arrive without typing (Q4)', () => {
    // Runtime path: HTTP/JSON can hand a string; Number.isInteger rejects it.
    expect(() => Quantity.of('2' as unknown as number)).toThrow(InvalidQuantityError);
  });
});

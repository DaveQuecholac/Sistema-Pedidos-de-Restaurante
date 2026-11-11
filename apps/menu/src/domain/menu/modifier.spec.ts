import { describe, expect, it } from 'vitest';
import { InvalidMoneyError, Money } from '../money/money';
import { ExclusionHasPriceError, ExtraMissingPriceError } from './menu-item.errors';
import { Modifier } from './modifier';

describe('Modifier', () => {
  it('accepts an extra with a MXN price (D1)', () => {
    const extra = Modifier.extra({
      id: 'mod-1',
      name: 'Queso',
      price: Money.of(1500, 'MXN'),
    });

    expect(extra.kind).toBe('extra');
    expect(extra.price?.amount).toBe(1500);
    expect(extra.price?.currency).toBe('MXN');
  });

  it('rejects an extra without a price or with an invalid currency (D2)', () => {
    expect(() => Modifier.extra({ id: 'mod-1', name: 'Queso' })).toThrow(ExtraMissingPriceError);
    expect(() =>
      Modifier.extra({
        id: 'mod-1',
        name: 'Queso',
        price: Money.of(1500, 'USD'),
      }),
    ).toThrow(InvalidMoneyError);
  });

  it('accepts an exclusion without a price (D3)', () => {
    const exclusion = Modifier.exclusion({ id: 'mod-2', name: 'Sin cebolla' });

    expect(exclusion.kind).toBe('exclusion');
    expect(exclusion.price).toBeNull();
  });

  it('rejects an exclusion that carries a zero price (D4)', () => {
    expect(() =>
      Modifier.exclusion({
        id: 'mod-2',
        name: 'Sin cebolla',
        price: Money.of(0, 'MXN'),
      }),
    ).toThrow(ExclusionHasPriceError);
  });
});

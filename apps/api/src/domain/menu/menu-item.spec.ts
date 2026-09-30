import { describe, expect, it } from 'vitest';
import { Money } from '../money/money';
import { MenuItem } from './menu-item';
import { BlankIdError, BlankNameError, ExtraMissingPriceError } from './menu-item.errors';
import { Modifier } from './modifier';
import { TaxRate } from './tax-rate';

function taco(overrides: Partial<Parameters<typeof MenuItem.create>[0]> = {}) {
  return {
    id: 'item-1',
    name: 'Tacos',
    price: Money.of(4500, 'MXN'),
    applicableTax: TaxRate.of(1600),
    modifiers: [] as Modifier[],
    ...overrides,
  };
}

describe('MenuItem', () => {
  it('trims the name, starts active, and accepts an empty modifier list (D5)', () => {
    const item = MenuItem.create(taco({ name: '  Tacos  ' }));

    expect(item.name).toBe('Tacos');
    expect(item.active).toBe(true);
    expect(item.modifiers).toHaveLength(0);
  });

  it('rejects a blank name (D6)', () => {
    for (const name of ['   ', '']) {
      expect(() => MenuItem.create(taco({ name }))).toThrow(BlankNameError);
    }
  });

  it('rejects a blank id (D7)', () => {
    expect(() => MenuItem.create(taco({ id: '  ' }))).toThrow(BlankIdError);
  });

  it('keeps an extra and an exclusion in the given order (D8)', () => {
    const extra = Modifier.extra({
      id: 'mod-1',
      name: 'Queso',
      price: Money.of(1500, 'MXN'),
    });
    const exclusion = Modifier.exclusion({ id: 'mod-2', name: 'Sin cebolla' });
    const item = MenuItem.create(taco({ modifiers: [extra, exclusion] }));

    expect(item.modifiers.map((modifier) => modifier.kind)).toEqual(['extra', 'exclusion']);
    expect(item.modifiers.map((modifier) => modifier.id)).toEqual(['mod-1', 'mod-2']);
  });

  it('does not let a push on the returned list change the dish (D9)', () => {
    const extra = Modifier.extra({
      id: 'mod-1',
      name: 'Queso',
      price: Money.of(1500, 'MXN'),
    });
    const item = MenuItem.create(taco({ modifiers: [extra] }));
    const returned = item.modifiers;

    returned.push(Modifier.exclusion({ id: 'mod-2', name: 'Sin cebolla' }));

    expect(item.modifiers).toHaveLength(1);
    expect(item.modifiers[0]?.id).toBe('mod-1');
  });

  it('deactivates an active dish into another value with the same modifiers (D10)', () => {
    const extra = Modifier.extra({
      id: 'mod-1',
      name: 'Queso',
      price: Money.of(1500, 'MXN'),
    });
    const item = MenuItem.create(taco({ modifiers: [extra] }));
    const inactive = item.deactivate();

    expect(inactive).not.toBe(item);
    expect(inactive.active).toBe(false);
    expect(inactive.id).toBe(item.id);
    expect(inactive.modifiers.map((modifier) => modifier.id)).toEqual(['mod-1']);
    expect(item.active).toBe(true);
  });

  it('leaves an inactive dish inactive with the same data (D11)', () => {
    const extra = Modifier.extra({
      id: 'mod-1',
      name: 'Queso',
      price: Money.of(1500, 'MXN'),
    });
    const item = MenuItem.restore({
      ...taco({ modifiers: [extra] }),
      active: false,
    });
    const again = item.deactivate();

    expect(again.active).toBe(false);
    expect(again.id).toBe(item.id);
    expect(again.name).toBe(item.name);
    expect(again.price.amount).toBe(item.price.amount);
    expect(again.applicableTax.basisPoints).toBe(item.applicableTax.basisPoints);
    expect(again.modifiers.map((modifier) => modifier.id)).toEqual(['mod-1']);
  });

  it('replaces data and keeps the dish id while modifier ids change (D12)', () => {
    const item = MenuItem.create(
      taco({
        modifiers: [
          Modifier.extra({ id: 'mod-1', name: 'Queso', price: Money.of(1500, 'MXN') }),
          Modifier.exclusion({ id: 'mod-2', name: 'Sin cebolla' }),
        ],
      }),
    );
    const replaced = item.replace({
      name: 'Quesadillas',
      price: Money.of(5200, 'MXN'),
      applicableTax: TaxRate.of(0),
      active: true,
      modifiers: [
        Modifier.extra({ id: 'mod-9', name: 'Guacamole', price: Money.of(2000, 'MXN') }),
        Modifier.exclusion({ id: 'mod-8', name: 'Sin cilantro' }),
      ],
    });

    expect(replaced.id).toBe(item.id);
    expect(replaced.modifiers.map((modifier) => modifier.id)).toEqual(['mod-9', 'mod-8']);
    expect(replaced.modifiers.map((modifier) => modifier.id)).not.toEqual(
      item.modifiers.map((modifier) => modifier.id),
    );
    expect(replaced.name).toBe('Quesadillas');
    expect(replaced.price.amount).toBe(5200);
    expect(replaced.applicableTax.basisPoints).toBe(0);
    expect(replaced.active).toBe(true);
  });

  it('restores an inactive dish when the data is valid (D13)', () => {
    const item = MenuItem.restore({ ...taco(), active: false });

    expect(item.active).toBe(false);
    expect(item.id).toBe('item-1');
    expect(item.name).toBe('Tacos');
  });

  it('rejects restore when an extra has no price, same as create (D14)', () => {
    const brokenExtra = () => Modifier.extra({ id: 'mod-1', name: 'Queso' });

    expect(() => MenuItem.create(taco({ modifiers: [brokenExtra()] }))).toThrow(ExtraMissingPriceError);
    expect(() =>
      MenuItem.restore({
        ...taco({ modifiers: [brokenExtra()] }),
        active: false,
      }),
    ).toThrow(ExtraMissingPriceError);
  });
});

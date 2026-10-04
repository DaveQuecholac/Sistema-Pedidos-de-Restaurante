import { describe, expect, it } from 'vitest';
import { Ingredient } from '../menu/ingredient';
import { MenuItem } from '../menu/menu-item';
import { ExclusionHasPriceError } from '../menu/menu-item.errors';
import { Modifier } from '../menu/modifier';
import { TaxRate } from '../menu/tax-rate';
import { Money } from '../money/money';
import { LineItem, LineModifier } from './line-item';
import {
  DuplicateModifierSelectionError,
  MenuItemUnavailableError,
  UnknownModifierError,
} from './order.errors';
import { Quantity } from './quantity';

const QUESO_ID = 'mod-queso';
const CILANTRO_ID = 'mod-cilantro';
const OTHER_EXTRA_ID = 'mod-other';

function tacos(): MenuItem {
  return MenuItem.create({
    id: 'item-tacos',
    name: 'Tacos',
    price: Money.of(4500, 'MXN'),
    applicableTax: TaxRate.of(1600),
    ingredients: [
      Ingredient.of({ id: 'ing-tortilla', name: 'Tortilla' }),
      Ingredient.of({ id: 'ing-suadero', name: 'Suadero' }),
      Ingredient.of({ id: 'ing-cilantro', name: 'Cilantro' }),
    ],
    modifiers: [
      Modifier.extra({ id: QUESO_ID, name: 'Queso', price: Money.of(1500, 'MXN') }),
      Modifier.exclusion({ id: CILANTRO_ID, name: 'Cilantro' }),
    ],
  });
}

function flanInactive(): MenuItem {
  return MenuItem.restore({
    id: 'item-flan',
    name: 'Flan',
    price: Money.of(3500, 'MXN'),
    applicableTax: TaxRate.of(1600),
    active: false,
    ingredients: [],
    modifiers: [],
  });
}

function otherDishWithExtra(): MenuItem {
  return MenuItem.create({
    id: 'item-agua',
    name: 'Agua',
    price: Money.of(2500, 'MXN'),
    applicableTax: TaxRate.of(1600),
    ingredients: [],
    modifiers: [Modifier.extra({ id: OTHER_EXTRA_ID, name: 'Chia', price: Money.of(500, 'MXN') })],
  });
}

describe('LineItem', () => {
  it('captures tacos with quantity 2 and no modifiers (LI1)', () => {
    const line = LineItem.capture({
      id: 'line-1',
      menuItem: tacos(),
      quantity: Quantity.of(2),
      modifierIds: [],
    });

    expect(line.id).toBe('line-1');
    expect(line.menuItemId).toBe('item-tacos');
    expect(line.name).toBe('Tacos');
    expect(line.unitPrice.amount).toBe(4500);
    expect(line.unitPrice.currency).toBe('MXN');
    expect(line.applicableTax.basisPoints).toBe(1600);
    expect(line.quantity.amount).toBe(2);
    expect(line.modifiers).toEqual([]);
  });

  it('captures the Queso extra with its price (LI2)', () => {
    const line = LineItem.capture({
      id: 'line-1',
      menuItem: tacos(),
      quantity: Quantity.of(1),
      modifierIds: [QUESO_ID],
    });

    expect(line.modifiers).toHaveLength(1);
    expect(line.modifiers[0]?.kind).toBe('extra');
    expect(line.modifiers[0]?.name).toBe('Queso');
    expect(line.modifiers[0]?.modifierId).toBe(QUESO_ID);
    expect(line.modifiers[0]?.price?.amount).toBe(1500);
  });

  it('captures the Cilantro exclusion with a null price (LI3)', () => {
    const line = LineItem.capture({
      id: 'line-1',
      menuItem: tacos(),
      quantity: Quantity.of(1),
      modifierIds: [CILANTRO_ID],
    });

    expect(line.modifiers).toHaveLength(1);
    expect(line.modifiers[0]?.kind).toBe('exclusion');
    expect(line.modifiers[0]?.name).toBe('Cilantro');
    expect(line.modifiers[0]?.price).toBeNull();
  });

  it('orders selected modifiers as on the dish, not as in the command (LI4)', () => {
    const line = LineItem.capture({
      id: 'line-1',
      menuItem: tacos(),
      quantity: Quantity.of(1),
      // Command lists exclusion before extra; dish has extra then exclusion.
      modifierIds: [CILANTRO_ID, QUESO_ID],
    });

    expect(line.modifiers.map((modifier) => modifier.modifierId)).toEqual([QUESO_ID, CILANTRO_ID]);
    expect(line.modifiers.map((modifier) => modifier.kind)).toEqual(['extra', 'exclusion']);
  });

  it('rejects an inactive dish (LI5)', () => {
    expect(() =>
      LineItem.capture({
        id: 'line-1',
        menuItem: flanInactive(),
        quantity: Quantity.of(1),
        modifierIds: [],
      }),
    ).toThrow(MenuItemUnavailableError);
  });

  it('rejects a modifier id from another dish (LI6)', () => {
    otherDishWithExtra();

    expect(() =>
      LineItem.capture({
        id: 'line-1',
        menuItem: tacos(),
        quantity: Quantity.of(1),
        modifierIds: [OTHER_EXTRA_ID],
      }),
    ).toThrow(UnknownModifierError);
  });

  it('rejects an invented modifier id (LI7)', () => {
    expect(() =>
      LineItem.capture({
        id: 'line-1',
        menuItem: tacos(),
        quantity: Quantity.of(1),
        modifierIds: ['mod-does-not-exist'],
      }),
    ).toThrow(UnknownModifierError);
  });

  it('rejects the same modifier id twice (LI8)', () => {
    expect(() =>
      LineItem.capture({
        id: 'line-1',
        menuItem: tacos(),
        quantity: Quantity.of(1),
        modifierIds: [QUESO_ID, QUESO_ID],
      }),
    ).toThrow(DuplicateModifierSelectionError);
  });

  it('keeps the captured price after the dish price changes and is deactivated (LI9)', () => {
    const dish = tacos();
    const line = LineItem.capture({
      id: 'line-1',
      menuItem: dish,
      quantity: Quantity.of(1),
      modifierIds: [QUESO_ID],
    });

    const updated = dish.replace({
      name: dish.name,
      price: Money.of(5000, 'MXN'),
      applicableTax: dish.applicableTax,
      active: false,
      ingredients: dish.ingredients,
      modifiers: [
        Modifier.extra({ id: 'mod-new', name: 'Nuez', price: Money.of(1000, 'MXN') }),
      ],
    });

    expect(updated.price.amount).toBe(5000);
    expect(updated.active).toBe(false);
    expect(line.unitPrice.amount).toBe(4500);
    expect(line.modifiers).toHaveLength(1);
    expect(line.modifiers[0]?.name).toBe('Queso');
    expect(line.modifiers[0]?.price?.amount).toBe(1500);
  });

  it('does not let a push on the returned modifiers change the line (LI10)', () => {
    const line = LineItem.capture({
      id: 'line-1',
      menuItem: tacos(),
      quantity: Quantity.of(1),
      modifierIds: [QUESO_ID],
    });
    const returned = line.modifiers;

    returned.push(
      LineModifier.restore({
        modifierId: CILANTRO_ID,
        name: 'Cilantro',
        kind: 'exclusion',
        price: null,
      }),
    );

    expect(line.modifiers).toHaveLength(1);
    expect(line.modifiers[0]?.modifierId).toBe(QUESO_ID);
  });

  it('recaptures with a new quantity and modifier while keeping the line id (LI11)', () => {
    const dish = tacos();
    const original = LineItem.capture({
      id: 'line-1',
      menuItem: dish,
      quantity: Quantity.of(1),
      modifierIds: [QUESO_ID],
    });

    const next = original.recapture({
      menuItem: dish,
      quantity: Quantity.of(3),
      modifierIds: [CILANTRO_ID],
    });

    expect(next.id).toBe('line-1');
    expect(next.quantity.amount).toBe(3);
    expect(next.modifiers).toHaveLength(1);
    expect(next.modifiers[0]?.kind).toBe('exclusion');
    expect(next.modifiers[0]?.name).toBe('Cilantro');
  });

  it('rejects restore of an exclusion that carries a price (LI12)', () => {
    expect(() =>
      LineItem.restore({
        id: 'line-1',
        menuItemId: 'item-tacos',
        name: 'Tacos',
        unitPrice: Money.of(4500, 'MXN'),
        applicableTax: TaxRate.of(1600),
        quantity: Quantity.of(1),
        modifiers: [
          {
            modifierId: CILANTRO_ID,
            name: 'Cilantro',
            kind: 'exclusion',
            price: Money.of(0, 'MXN'),
          },
        ],
      }),
    ).toThrow(ExclusionHasPriceError);
  });
});

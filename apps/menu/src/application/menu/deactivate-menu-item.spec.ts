import { describe, expect, it } from 'vitest';
import { Ingredient } from '../../domain/menu/ingredient';
import { MenuItem } from '../../domain/menu/menu-item';
import { Modifier } from '../../domain/menu/modifier';
import { Money } from '../../domain/money/money';
import { TaxRate } from '../../domain/menu/tax-rate';
import { MenuRepository } from '../ports/menu-repository';
import { DeactivateMenuItem } from './deactivate-menu-item';
import { InMemoryMenuRepository } from './in-memory-menu-repository';
import { MenuItemNotFoundError } from './menu-item-repository.errors';

function watch(menu: MenuRepository) {
  const calls = { save: 0 };
  const wrapped: MenuRepository = {
    add: (item) => menu.add(item),
    async save(item) {
      calls.save += 1;
      await menu.save(item);
    },
    findById: (id) => menu.findById(id),
    list: () => menu.list(),
  };
  return { menu: wrapped, calls };
}

function activeDish(): MenuItem {
  return MenuItem.create({
    id: 'item-1',
    name: 'Tacos',
    price: Money.of(4500, 'MXN'),
    applicableTax: TaxRate.of(1600),
    ingredients: [Ingredient.of({ id: 'ing-1', name: 'Sin cebolla' })],
    modifiers: [
      Modifier.extra({ id: 'mod-1', name: 'Queso', price: Money.of(1500, 'MXN') }),
      Modifier.exclusion({ id: 'mod-2', name: 'Sin cebolla' }),
    ],
  });
}

describe('DeactivateMenuItem', () => {
  it('rejects a missing id and does not call save (X1)', async () => {
    const menu = new InMemoryMenuRepository();
    const seen = watch(menu);

    await expect(new DeactivateMenuItem(seen.menu).execute('missing')).rejects.toBeInstanceOf(
      MenuItemNotFoundError,
    );
    expect(seen.calls.save).toBe(0);
  });

  it('deactivates an active dish and keeps its modifiers (X2)', async () => {
    const menu = new InMemoryMenuRepository();
    await menu.add(activeDish());
    const seen = watch(menu);

    const inactive = await new DeactivateMenuItem(seen.menu).execute('item-1');

    expect(seen.calls.save).toBe(1);
    expect(inactive.active).toBe(false);
    expect(inactive.id).toBe('item-1');
    expect(inactive.modifiers.map((modifier) => modifier.id)).toEqual(['mod-1', 'mod-2']);
  });

  it('does not save again when the dish is already inactive (X3)', async () => {
    const menu = new InMemoryMenuRepository();
    await menu.add(activeDish());
    const seen = watch(menu);
    const useCase = new DeactivateMenuItem(seen.menu);

    const first = await useCase.execute('item-1');
    const second = await useCase.execute(first.id);

    expect(second.active).toBe(false);
    expect(seen.calls.save).toBe(1);
  });

  it('does not save a dish that was stored inactive (X4)', async () => {
    const menu = new InMemoryMenuRepository();
    await menu.add(
      MenuItem.restore({
        id: 'item-1',
        name: 'Tacos',
        price: Money.of(4500, 'MXN'),
        applicableTax: TaxRate.of(1600),
        ingredients: [],
        modifiers: [],
        active: false,
      }),
    );
    const seen = watch(menu);

    const result = await new DeactivateMenuItem(seen.menu).execute('item-1');

    expect(result.active).toBe(false);
    expect(seen.calls.save).toBe(0);
  });

  it('keeps a deactivated dish in the list (X5)', async () => {
    const menu = new InMemoryMenuRepository();
    await menu.add(activeDish());

    await new DeactivateMenuItem(menu).execute('item-1');

    const listed = await menu.list();
    expect(listed.map((item) => item.id)).toEqual(['item-1']);
    expect(listed[0]?.active).toBe(false);
  });
});

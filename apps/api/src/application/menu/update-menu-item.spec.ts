import { describe, expect, it } from 'vitest';
import { MenuItem } from '../../domain/menu/menu-item';
import { BlankNameError } from '../../domain/menu/menu-item.errors';
import { Modifier } from '../../domain/menu/modifier';
import { Money } from '../../domain/money/money';
import { TaxRate } from '../../domain/menu/tax-rate';
import { MenuRepository } from '../ports/menu-repository';
import { InMemoryMenuRepository } from './in-memory-menu-repository';
import { MenuItemNotFoundError } from './menu-item-repository.errors';
import { UpdateMenuItem, UpdateMenuItemCommand } from './update-menu-item';

function idsOf(...values: string[]): () => string {
  const pending = [...values];
  return () => {
    const next = pending.shift();
    if (next === undefined) {
      throw new Error('test id generator ran out');
    }
    return next;
  };
}

function watch(menu: MenuRepository) {
  const calls = { add: 0, save: 0 };
  const wrapped: MenuRepository = {
    async add(item) {
      calls.add += 1;
      await menu.add(item);
    },
    async save(item) {
      calls.save += 1;
      await menu.save(item);
    },
    findById: (id) => menu.findById(id),
    list: () => menu.list(),
  };
  return { menu: wrapped, calls };
}

function storedDish(): MenuItem {
  return MenuItem.create({
    id: 'item-1',
    name: 'Tacos',
    price: Money.of(4500, 'MXN'),
    applicableTax: TaxRate.of(1600),
    modifiers: [
      Modifier.extra({ id: 'mod-1', name: 'Queso', price: Money.of(1500, 'MXN') }),
      Modifier.exclusion({ id: 'mod-2', name: 'Sin cebolla' }),
    ],
  });
}

function command(overrides: Partial<UpdateMenuItemCommand> = {}): UpdateMenuItemCommand {
  return {
    id: 'item-1',
    name: 'Quesadillas',
    price: { amount: 5200, currency: 'MXN' },
    applicableTax: { basisPoints: 800 },
    active: true,
    modifiers: [
      { name: 'Guacamole', kind: 'extra', price: { amount: 2000, currency: 'MXN' } },
      { name: 'Sin cilantro', kind: 'exclusion' },
    ],
    ...overrides,
  };
}

describe('UpdateMenuItem', () => {
  it('rejects a missing id and does not call save (U1)', async () => {
    const menu = new InMemoryMenuRepository();
    const seen = watch(menu);
    const useCase = new UpdateMenuItem(seen.menu, idsOf('mod-9'));

    await expect(useCase.execute(command())).rejects.toBeInstanceOf(MenuItemNotFoundError);
    expect(seen.calls.save).toBe(0);
  });

  it('saves the new name, price, tax, and modifiers on the same dish id (U2)', async () => {
    const menu = new InMemoryMenuRepository();
    await menu.add(storedDish());
    const seen = watch(menu);
    const useCase = new UpdateMenuItem(seen.menu, idsOf('mod-9', 'mod-8'));

    const updated = await useCase.execute(command());

    expect(updated.id).toBe('item-1');
    expect(seen.calls.save).toBe(1);
    const stored = await menu.findById('item-1');
    expect(stored?.name).toBe('Quesadillas');
    expect(stored?.price.amount).toBe(5200);
    expect(stored?.applicableTax.basisPoints).toBe(800);
    expect(stored?.modifiers.map((modifier) => modifier.name)).toEqual(['Guacamole', 'Sin cilantro']);
  });

  it('does not change the stored dish when the command is invalid (U3)', async () => {
    const menu = new InMemoryMenuRepository();
    await menu.add(storedDish());
    const seen = watch(menu);
    const useCase = new UpdateMenuItem(seen.menu, idsOf('mod-9', 'mod-8'));

    await expect(useCase.execute(command({ name: '   ' }))).rejects.toBeInstanceOf(BlankNameError);

    expect(seen.calls.save).toBe(0);
    const stored = await menu.findById('item-1');
    expect(stored?.name).toBe('Tacos');
    expect(stored?.price.amount).toBe(4500);
    expect(stored?.modifiers.map((modifier) => modifier.id)).toEqual(['mod-1', 'mod-2']);
  });

  it('replaces modifiers with new ids in command order (U4)', async () => {
    const menu = new InMemoryMenuRepository();
    await menu.add(storedDish());
    const useCase = new UpdateMenuItem(menu, idsOf('mod-9', 'mod-8'));

    const updated = await useCase.execute(
      command({
        modifiers: [
          { name: 'Sin cilantro', kind: 'exclusion' },
          { name: 'Guacamole', kind: 'extra', price: { amount: 2000, currency: 'MXN' } },
        ],
      }),
    );

    expect(updated.modifiers.map((modifier) => modifier.id)).toEqual(['mod-9', 'mod-8']);
    expect(updated.modifiers.map((modifier) => modifier.id)).not.toEqual(['mod-1', 'mod-2']);
    expect(updated.modifiers.map((modifier) => modifier.name)).toEqual(['Sin cilantro', 'Guacamole']);
  });

  it('reactivates an inactive dish with one save (U5)', async () => {
    const menu = new InMemoryMenuRepository();
    const inactive = storedDish().deactivate();
    await menu.add(inactive);
    const seen = watch(menu);
    const useCase = new UpdateMenuItem(seen.menu, idsOf('mod-9', 'mod-8'));

    const updated = await useCase.execute(command({ active: true }));

    expect(seen.calls.save).toBe(1);
    expect(updated.active).toBe(true);
    expect((await menu.findById('item-1'))?.active).toBe(true);
  });

  it('deactivates through an edit and replaces the modifiers (U6)', async () => {
    const menu = new InMemoryMenuRepository();
    await menu.add(storedDish());
    const useCase = new UpdateMenuItem(menu, idsOf('mod-9'));

    const updated = await useCase.execute(
      command({
        active: false,
        modifiers: [{ name: 'Sin cilantro', kind: 'exclusion' }],
      }),
    );

    expect(updated.active).toBe(false);
    expect(updated.modifiers.map((modifier) => modifier.id)).toEqual(['mod-9']);
    expect(updated.modifiers.map((modifier) => modifier.kind)).toEqual(['exclusion']);
    const stored = await menu.findById('item-1');
    expect(stored?.active).toBe(false);
    expect(stored?.modifiers.map((modifier) => modifier.id)).toEqual(['mod-9']);
  });
});

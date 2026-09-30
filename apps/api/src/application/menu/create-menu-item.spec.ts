import { describe, expect, it } from 'vitest';
import {
  BlankNameError,
  ExclusionHasPriceError,
  ExtraMissingPriceError,
  InvalidModifierKindError,
} from '../../domain/menu/menu-item.errors';
import { Modifier } from '../../domain/menu/modifier';
import { InvalidMoneyError } from '../../domain/money/money';
import { InvalidTaxRateError } from '../../domain/menu/tax-rate';
import { MenuRepository } from '../ports/menu-repository';
import { InMemoryMenuRepository } from './in-memory-menu-repository';
import { MenuItemAlreadyExistsError } from './menu-item-repository.errors';
import { CreateMenuItem, CreateMenuItemCommand } from './create-menu-item';

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

function command(overrides: Partial<CreateMenuItemCommand> = {}): CreateMenuItemCommand {
  return {
    name: 'Tacos',
    price: { amount: 4500, currency: 'MXN' },
    applicableTax: { basisPoints: 1600 },
    modifiers: [
      { name: 'Queso', kind: 'extra', price: { amount: 1500, currency: 'MXN' } },
      { name: 'Sin cebolla', kind: 'exclusion' },
    ],
    ...overrides,
  };
}

describe('CreateMenuItem', () => {
  it('stores an active dish with an extra and an exclusion (C1)', async () => {
    const menu = new InMemoryMenuRepository();
    const seen = watch(menu);
    const useCase = new CreateMenuItem(seen.menu, idsOf('item-1', 'mod-1', 'mod-2'));

    const created = await useCase.execute(command());

    expect(seen.calls.add).toBe(1);
    expect(created.active).toBe(true);
    expect(created.id).toBe('item-1');
    expect(created.price.amount).toBe(4500);
    expect(created.price.currency).toBe('MXN');
    expect(created.applicableTax.basisPoints).toBe(1600);
    expect(created.modifiers[0]?.kind).toBe('extra');
    expect(created.modifiers[0]?.price?.amount).toBe(1500);
    expect(created.modifiers[1]?.kind).toBe('exclusion');
    expect(created.modifiers[1]?.price).toBeNull();
  });

  it('stores a dish with no modifiers (C2)', async () => {
    const menu = new InMemoryMenuRepository();
    const seen = watch(menu);
    const useCase = new CreateMenuItem(seen.menu, idsOf('item-1'));

    const created = await useCase.execute(command({ modifiers: [] }));

    expect(seen.calls.add).toBe(1);
    expect(created.modifiers).toEqual([]);
  });

  it('rejects an invalid command and does not call add (C3)', async () => {
    const cases: Array<{ command: CreateMenuItemCommand; error: new () => Error }> = [
      { command: command({ name: '   ', modifiers: [] }), error: BlankNameError },
      {
        command: command({ price: { amount: 1.5, currency: 'MXN' }, modifiers: [] }),
        error: InvalidMoneyError,
      },
      {
        command: command({ applicableTax: { basisPoints: -1 }, modifiers: [] }),
        error: InvalidTaxRateError,
      },
      {
        command: command({ modifiers: [{ name: 'Queso', kind: 'extra' }] }),
        error: ExtraMissingPriceError,
      },
      {
        command: command({
          modifiers: [{ name: 'Sin cebolla', kind: 'exclusion', price: { amount: 0, currency: 'MXN' } }],
        }),
        error: ExclusionHasPriceError,
      },
      {
        command: command({ modifiers: [{ name: 'Queso', kind: 'garnish' }] }),
        error: InvalidModifierKindError,
      },
    ];

    for (const entry of cases) {
      const menu = new InMemoryMenuRepository();
      const seen = watch(menu);
      const useCase = new CreateMenuItem(seen.menu, idsOf('item-1', 'mod-1'));

      await expect(useCase.execute(entry.command)).rejects.toBeInstanceOf(entry.error);
      expect(seen.calls.add).toBe(0);
    }
  });

  it('keeps the original dish when the generated id already exists (C4)', async () => {
    const menu = new InMemoryMenuRepository();
    const useCase = new CreateMenuItem(menu, idsOf('item-1', 'item-1'));
    const original = await useCase.execute(command({ name: 'Tacos', modifiers: [] }));

    await expect(useCase.execute(command({ name: 'Quesadillas', modifiers: [] }))).rejects.toBeInstanceOf(
      MenuItemAlreadyExistsError,
    );

    const stored = await menu.findById('item-1');
    expect(stored?.name).toBe(original.name);
    expect(stored?.price.amount).toBe(original.price.amount);
    expect(stored?.active).toBe(true);
  });

  it('accepts a zero price, a zero tax, and a free extra (C5)', async () => {
    const menu = new InMemoryMenuRepository();
    const seen = watch(menu);
    const useCase = new CreateMenuItem(seen.menu, idsOf('item-1', 'mod-1'));

    const created = await useCase.execute(
      command({
        price: { amount: 0, currency: 'MXN' },
        applicableTax: { basisPoints: 0 },
        modifiers: [{ name: 'Queso', kind: 'extra', price: { amount: 0, currency: 'MXN' } }],
      }),
    );

    expect(seen.calls.add).toBe(1);
    expect(created.price.amount).toBe(0);
    expect(created.applicableTax.basisPoints).toBe(0);
    expect(created.modifiers[0]?.price?.amount).toBe(0);
  });

  it('stores two dishes that share a name and have different ids (C6)', async () => {
    const menu = new InMemoryMenuRepository();
    const useCase = new CreateMenuItem(menu, idsOf('item-1', 'item-2'));

    await useCase.execute(command({ name: 'Tacos', modifiers: [] }));
    await useCase.execute(command({ name: 'Tacos', modifiers: [] }));

    const stored = await menu.list();
    expect(stored.map((item) => item.id)).toEqual(['item-1', 'item-2']);
    expect(stored.map((item) => item.name)).toEqual(['Tacos', 'Tacos']);
  });

  it('keeps the stored modifiers when the caller mutates the returned list (C7)', async () => {
    const menu = new InMemoryMenuRepository();
    const useCase = new CreateMenuItem(menu, idsOf('item-1', 'mod-1'));
    const created = await useCase.execute(
      command({
        modifiers: [{ name: 'Queso', kind: 'extra', price: { amount: 1500, currency: 'MXN' } }],
      }),
    );

    created.modifiers.push(Modifier.exclusion({ id: 'mod-9', name: 'Sin cebolla' }));

    const stored = await menu.findById('item-1');
    expect(stored?.modifiers.map((modifier) => modifier.id)).toEqual(['mod-1']);
  });
});

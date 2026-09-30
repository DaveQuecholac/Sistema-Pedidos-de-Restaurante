import { describe, expect, it } from 'vitest';
import { MenuItem } from '../../domain/menu/menu-item';
import { Money } from '../../domain/money/money';
import { TaxRate } from '../../domain/menu/tax-rate';
import { InMemoryMenuRepository } from './in-memory-menu-repository';
import { ListMenuItems } from './list-menu-items';

function dish(id: string, name: string, active: boolean): MenuItem {
  const data = {
    id,
    name,
    price: Money.of(4500, 'MXN'),
    applicableTax: TaxRate.of(1600),
    modifiers: [],
  };
  return active ? MenuItem.create(data) : MenuItem.restore({ ...data, active: false });
}

describe('ListMenuItems', () => {
  it('returns an empty list when the repository has no dishes (L1)', async () => {
    const listed = await new ListMenuItems(new InMemoryMenuRepository()).execute();

    expect(listed).toEqual([]);
  });

  it('returns active and inactive dishes in insert order (L2)', async () => {
    const menu = new InMemoryMenuRepository();
    await menu.add(dish('item-1', 'Tacos', true));
    await menu.add(dish('item-2', 'Quesadillas', false));

    const listed = await new ListMenuItems(menu).execute();

    expect(listed.map((item) => item.id)).toEqual(['item-1', 'item-2']);
    expect(listed.map((item) => item.active)).toEqual([true, false]);
  });

  it('keeps the first-add position after a save changes the name (L3)', async () => {
    const menu = new InMemoryMenuRepository();
    await menu.add(dish('item-1', 'Tacos', true));
    await menu.add(dish('item-2', 'Agua', true));
    const first = await menu.findById('item-1');
    await menu.save(
      first!.replace({
        name: 'Tacos dorados',
        price: first!.price,
        applicableTax: first!.applicableTax,
        active: first!.active,
        modifiers: first!.modifiers,
      }),
    );

    const listed = await new ListMenuItems(menu).execute();

    expect(listed.map((item) => item.id)).toEqual(['item-1', 'item-2']);
    expect(listed[0]?.name).toBe('Tacos dorados');
  });
});

import { Ingredient } from '../../domain/menu/ingredient';
import { MenuItem } from '../../domain/menu/menu-item';
import { Modifier } from '../../domain/menu/modifier';
import { Money } from '../../domain/money/money';
import { TaxRate } from '../../domain/menu/tax-rate';
import type { MenuListCache } from '../ports/menu-list-cache';
import type { MenuRepository } from '../ports/menu-repository';

export const MENU_LIST_CACHE_KEY = 'menu:items';

type MoneySnapshot = { amount: number; currency: string };

type MenuItemSnapshot = {
  id: string;
  name: string;
  price: MoneySnapshot;
  applicableTax: { basisPoints: number };
  active: boolean;
  ingredients: { id: string; name: string }[];
  modifiers: { id: string; name: string; kind: string; price: MoneySnapshot | null }[];
};

/**
 * Cache-aside for the catalog list.
 * Miss loads the repository and stores the snapshot with a TTL.
 * A write drops the key so the next read sees the database.
 */
export class CachingMenuRepository implements MenuRepository {
  constructor(
    private readonly inner: MenuRepository,
    private readonly cache: MenuListCache,
    private readonly ttlSeconds: number,
  ) {}

  async add(item: MenuItem): Promise<void> {
    await this.inner.add(item);
    await this.cache.delete(MENU_LIST_CACHE_KEY);
  }

  async save(item: MenuItem): Promise<void> {
    await this.inner.save(item);
    await this.cache.delete(MENU_LIST_CACHE_KEY);
  }

  findById(id: string): Promise<MenuItem | null> {
    return this.inner.findById(id);
  }

  async list(): Promise<MenuItem[]> {
    const cached = await this.cache.get(MENU_LIST_CACHE_KEY);
    if (cached !== null) {
      const restored = restoreList(cached);
      if (restored !== null) {
        return restored;
      }
      await this.cache.delete(MENU_LIST_CACHE_KEY);
    }

    const items = await this.inner.list();
    await this.cache.set(MENU_LIST_CACHE_KEY, JSON.stringify(items.map(snapshotOf)), this.ttlSeconds);
    return items;
  }
}

function snapshotOf(item: MenuItem): MenuItemSnapshot {
  return {
    id: item.id,
    name: item.name,
    price: { amount: item.price.amount, currency: item.price.currency },
    applicableTax: { basisPoints: item.applicableTax.basisPoints },
    active: item.active,
    ingredients: item.ingredients.map((ingredient) => ({ id: ingredient.id, name: ingredient.name })),
    modifiers: item.modifiers.map((modifier) => ({
      id: modifier.id,
      name: modifier.name,
      kind: modifier.kind,
      price:
        modifier.price === null
          ? null
          : { amount: modifier.price.amount, currency: modifier.price.currency },
    })),
  };
}

function restoreList(raw: string): MenuItem[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.map((entry) => restoreItem(entry));
  } catch {
    return null;
  }
}

function restoreItem(value: unknown): MenuItem {
  if (typeof value !== 'object' || value === null) {
    throw new Error('cached menu item is not an object');
  }
  const item = value as MenuItemSnapshot;
  return MenuItem.restore({
    id: item.id,
    name: item.name,
    price: Money.of(item.price.amount, item.price.currency),
    applicableTax: TaxRate.of(item.applicableTax.basisPoints),
    active: item.active,
    ingredients: item.ingredients.map((ingredient) => Ingredient.of(ingredient)),
    modifiers: item.modifiers.map((modifier) => {
      if (modifier.kind === 'extra') {
        if (modifier.price === null) {
          throw new Error('cached extra is missing a price');
        }
        return Modifier.extra({
          id: modifier.id,
          name: modifier.name,
          price: Money.of(modifier.price.amount, modifier.price.currency),
        });
      }
      if (modifier.kind === 'exclusion') {
        return Modifier.exclusion({ id: modifier.id, name: modifier.name });
      }
      throw new Error('cached modifier kind is unknown');
    }),
  });
}

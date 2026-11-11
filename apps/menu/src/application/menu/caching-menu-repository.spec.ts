import { describe, expect, it } from 'vitest';
import { MenuItem } from '../../domain/menu/menu-item';
import { Money } from '../../domain/money/money';
import { TaxRate } from '../../domain/menu/tax-rate';
import type { MenuRepository } from '../ports/menu-repository';
import { CachingMenuRepository } from './caching-menu-repository';
import { InMemoryMenuListCache } from './in-memory-menu-list-cache';
import { InMemoryMenuRepository } from './in-memory-menu-repository';
import { readMenuCacheTtlSeconds } from './menu-cache-ttl';

function dish(id: string, name: string): MenuItem {
  return MenuItem.create({
    id,
    name,
    price: Money.of(4500, 'MXN'),
    applicableTax: TaxRate.of(1600),
    ingredients: [],
    modifiers: [],
  });
}

class CountingMenu implements MenuRepository {
  listCalls = 0;

  constructor(private readonly inner: MenuRepository) {}

  add(item: MenuItem): Promise<void> {
    return this.inner.add(item);
  }

  save(item: MenuItem): Promise<void> {
    return this.inner.save(item);
  }

  findById(id: string): Promise<MenuItem | null> {
    return this.inner.findById(id);
  }

  async list(): Promise<MenuItem[]> {
    this.listCalls += 1;
    return this.inner.list();
  }
}

describe('cache-aside menu list', () => {
  it('reads the database once and then the cache', async () => {
    const inner = new CountingMenu(new InMemoryMenuRepository());
    await inner.add(dish('item-1', 'Tacos'));
    const cache = new InMemoryMenuListCache();
    const menu = new CachingMenuRepository(inner, cache, 60);
    inner.listCalls = 0;

    const first = await menu.list();
    const second = await menu.list();

    expect(first.map((item) => item.name)).toEqual(['Tacos']);
    expect(second.map((item) => item.id)).toEqual(['item-1']);
    expect(inner.listCalls).toBe(1);
  });

  it('drops the key after a write so the next list misses', async () => {
    const inner = new CountingMenu(new InMemoryMenuRepository());
    const menu = new CachingMenuRepository(inner, new InMemoryMenuListCache(), 60);
    await menu.add(dish('item-1', 'Tacos'));
    await menu.list();
    inner.listCalls = 0;

    await menu.save(
      (await menu.findById('item-1'))!.replace({
        name: 'Tacos dorados',
        price: Money.of(4500, 'MXN'),
        applicableTax: TaxRate.of(1600),
        active: true,
        ingredients: [],
        modifiers: [],
      }),
    );
    const listed = await menu.list();

    expect(listed[0]?.name).toBe('Tacos dorados');
    expect(inner.listCalls).toBe(1);
  });

  it('expires the list when the TTL elapses', async () => {
    let now = 0;
    const inner = new CountingMenu(new InMemoryMenuRepository());
    await inner.add(dish('item-1', 'Tacos'));
    const menu = new CachingMenuRepository(inner, new InMemoryMenuListCache(() => now), 60);
    inner.listCalls = 0;

    await menu.list();
    now = 59_999;
    await menu.list();
    now = 60_000;
    await menu.list();

    expect(inner.listCalls).toBe(2);
  });
});

describe('menu cache TTL', () => {
  it('defaults to 60 seconds and rejects zero', () => {
    expect(readMenuCacheTtlSeconds(undefined)).toBe(60);
    expect(readMenuCacheTtlSeconds('30')).toBe(30);
    expect(() => readMenuCacheTtlSeconds('0')).toThrow(/MENU_CACHE_TTL_SECONDS/);
    expect(() => readMenuCacheTtlSeconds('1.5')).toThrow(/MENU_CACHE_TTL_SECONDS/);
  });
});

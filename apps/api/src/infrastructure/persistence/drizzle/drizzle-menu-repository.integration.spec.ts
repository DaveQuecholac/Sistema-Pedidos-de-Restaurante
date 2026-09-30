import { asc, eq, sql } from 'drizzle-orm';
import type { Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MenuItemAlreadyExistsError,
  MenuItemMappingError,
  MenuItemNotFoundError,
} from '../../../application/menu/menu-item-repository.errors';
import { Ingredient } from '../../../domain/menu/ingredient';
import { MenuItem } from '../../../domain/menu/menu-item';
import { Modifier } from '../../../domain/menu/modifier';
import { TaxRate } from '../../../domain/menu/tax-rate';
import { Money } from '../../../domain/money/money';
import { type AppDatabase, createDatabase } from './client';
import { DrizzleMenuRepository, type MenuDatabase } from './drizzle-menu-repository';
import { menuItemModifiers } from './schema/menu';

const integrationOn = process.env.MENU_REPOSITORY_INTEGRATION === '1';

if (integrationOn && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const describeIntegration = integrationOn ? describe : describe.skip;

describeIntegration('DrizzleMenuRepository', () => {
  let client: Sql;
  let db: AppDatabase;

  beforeAll(() => {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is required');
    }

    const opened = createDatabase(url);
    client = opened.client;
    db = opened.db;
  });

  afterAll(async () => {
    await client.end();
  });

  it('stores an extra before an exclusion and reads cents, MXN, tax and a null exclusion price (P1)', async () => {
    const itemId = id();
    const item = dish(itemId, [
      Modifier.extra({ id: `z-extra-${itemId}`, name: 'Queso', price: Money.of(1500, 'MXN') }),
      Modifier.exclusion({ id: `a-exclusion-${itemId}`, name: 'Sin cilantro' }),
    ]);

    await inTransaction(db, async (repo) => {
      await repo.add(item);

      const found = await repo.findById(itemId);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(itemId);
      expect(found?.price.amount).toBe(4500);
      expect(found?.price.currency).toBe('MXN');
      expect(found?.applicableTax.basisPoints).toBe(1600);
      expect(found?.active).toBe(true);
      expect(found?.modifiers.map((modifier) => modifier.kind)).toEqual(['extra', 'exclusion']);
      expect(found?.modifiers[0]?.price?.amount).toBe(1500);
      expect(found?.modifiers[1]?.price).toBeNull();
    });
  });

  it('stays visible to another repository on the same transaction and disappears after rollback (P2)', async () => {
    const itemId = id();

    await inTransaction(db, async (repo, tx) => {
      await repo.add(dish(itemId, [Modifier.exclusion({ id: id(), name: 'Sin cebolla' })]));

      const other = new DrizzleMenuRepository(tx);
      const found = await other.findById(itemId);

      expect(found?.id).toBe(itemId);
    });

    const outside = new DrizzleMenuRepository(db);
    expect(await outside.findById(itemId)).toBeNull();
  });

  it('replaces the name and drops the previous modifiers (P3)', async () => {
    const itemId = id();
    const original = dish(itemId, [
      Modifier.extra({ id: id(), name: 'Queso', price: Money.of(1500, 'MXN') }),
      Modifier.exclusion({ id: id(), name: 'Sin cilantro' }),
    ]);
    const replacement = MenuItem.restore({
      id: itemId,
      name: 'Tacos de suadero',
      price: original.price,
      applicableTax: original.applicableTax,
      active: true,
      ingredients: [],
      modifiers: [Modifier.extra({ id: id(), name: 'Salsa', price: Money.of(500, 'MXN') })],
    });

    await inTransaction(db, async (repo) => {
      await repo.add(original);
      await repo.save(replacement);

      const found = await repo.findById(itemId);

      expect(found?.id).toBe(itemId);
      expect(found?.name).toBe('Tacos de suadero');
      expect(found?.modifiers).toHaveLength(1);
      expect(found?.modifiers[0]?.name).toBe('Salsa');
    });
  });

  it('rejects save of a missing id and leaves no modifiers (P4)', async () => {
    const itemId = id();
    const missing = dish(itemId, [
      Modifier.extra({ id: id(), name: 'Queso', price: Money.of(1500, 'MXN') }),
    ]);

    await inTransaction(db, async (repo, tx) => {
      await expect(repo.save(missing)).rejects.toBeInstanceOf(MenuItemNotFoundError);

      const children = await tx
        .select()
        .from(menuItemModifiers)
        .where(eq(menuItemModifiers.menuItemId, itemId));

      expect(children).toHaveLength(0);
    });
  });

  it('rejects a second add with the same id and keeps the first modifier (P5)', async () => {
    const itemId = id();
    const first = dish(itemId, [
      Modifier.extra({ id: id(), name: 'Queso', price: Money.of(1500, 'MXN') }),
    ]);
    const duplicate = dish(itemId, [
      Modifier.exclusion({ id: id(), name: 'Sin cilantro' }),
    ]);

    await inTransaction(db, async (repo) => {
      await repo.add(first);

      await expect(repo.add(duplicate)).rejects.toBeInstanceOf(MenuItemAlreadyExistsError);

      const found = await repo.findById(itemId);
      expect(found?.modifiers).toHaveLength(1);
      expect(found?.modifiers[0]?.kind).toBe('extra');
    });
  });

  it('rejects a stored currency the catalog does not accept (P6)', async () => {
    const itemId = id();

    await inTransaction(db, async (repo, tx) => {
      await tx.execute(sql`
        insert into menu_items (id, name, price_amount, price_currency, tax_basis_points, active)
        values (${itemId}, 'Plato', 100, 'USD', 1600, true)
      `);

      await expect(repo.findById(itemId)).rejects.toBeInstanceOf(MenuItemMappingError);
    });
  });

  it('lists an active dish and an inactive dish ordered by id (P7)', async () => {
    const suffix = id();
    const activeId = `a-${suffix}`;
    const inactiveId = `b-${suffix}`;

    await inTransaction(db, async (repo) => {
      await repo.add(dish(inactiveId, [], false));
      await repo.add(dish(activeId, [], true));

      const listed = await repo.list();
      const ids = listed.map((item) => item.id);

      expect(ids).toEqual([...ids].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)));
      expect(ids.indexOf(activeId)).toBeLessThan(ids.indexOf(inactiveId));
      expect(listed.find((item) => item.id === activeId)?.active).toBe(true);
      expect(listed.find((item) => item.id === inactiveId)?.active).toBe(false);
    });
  });

  it('stores a null price on an exclusion and both amount and currency on an extra (P8)', async () => {
    const itemId = id();

    await inTransaction(db, async (repo, tx) => {
      await repo.add(
        dish(itemId, [
          Modifier.extra({ id: id(), name: 'Queso', price: Money.of(1500, 'MXN') }),
          Modifier.exclusion({ id: id(), name: 'Sin cilantro' }),
        ]),
      );

      const rows = await tx
        .select()
        .from(menuItemModifiers)
        .where(eq(menuItemModifiers.menuItemId, itemId))
        .orderBy(asc(menuItemModifiers.position));

      expect(rows[0]?.priceAmount).toBe(1500);
      expect(rows[0]?.priceCurrency).toBe('MXN');
      expect(rows[1]?.priceAmount).toBeNull();
      expect(rows[1]?.priceCurrency).toBeNull();
      expect(rows[0]?.ingredientId).toBeNull();
      expect(rows[1]?.ingredientId).toBe(`ing-${rows[1]?.id}`);
    });
  });
});

class RollbackSignal extends Error {
  constructor() {
    super('rollback');
    this.name = 'RollbackSignal';
  }
}

async function inTransaction(
  db: AppDatabase,
  run: (repo: DrizzleMenuRepository, tx: MenuDatabase) => Promise<void>,
): Promise<void> {
  let failure: unknown;

  try {
    await db.transaction(async (tx) => {
      const repo = new DrizzleMenuRepository(tx);
      try {
        await run(repo, tx);
      } catch (error) {
        failure = error;
      }
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      throw error;
    }
  }

  if (failure) {
    throw failure;
  }
}

function dish(itemId: string, modifiers: Modifier[], active = true): MenuItem {
  return MenuItem.restore({
    id: itemId,
    name: 'Tacos',
    price: Money.of(4500, 'MXN'),
    applicableTax: TaxRate.of(1600),
    active,
    ingredients: modifiers
      .filter((modifier) => modifier.kind === 'exclusion')
      .map((modifier) => Ingredient.of({ id: `ing-${modifier.id}`, name: modifier.name })),
    modifiers,
  });
}

function id(): string {
  return crypto.randomUUID();
}

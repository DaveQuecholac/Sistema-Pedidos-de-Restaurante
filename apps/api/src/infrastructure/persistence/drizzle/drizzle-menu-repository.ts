import { asc, eq, type ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  MenuItemAlreadyExistsError,
  MenuItemNotFoundError,
} from '../../../application/menu/menu-item-repository.errors';
import type { MenuRepository } from '../../../application/ports/menu-repository';
import type { Ingredient } from '../../../domain/menu/ingredient';
import { ExclusionUnknownIngredientError } from '../../../domain/menu/menu-item.errors';
import type { MenuItem } from '../../../domain/menu/menu-item';
import type { Modifier } from '../../../domain/menu/modifier';
import type { AppDatabase } from './client';
import {
  toMenuItem,
  type MenuItemIngredientRow,
  type MenuItemModifierRow,
  type MenuItemRow,
} from './menu-item.mapper';
import * as schema from './schema/menu';
import { menuItemIngredients, menuItemModifiers, menuItems } from './schema/menu';

type MenuSchema = typeof schema;

/** Root client from `createDatabase`, or the `tx` passed to a Drizzle transaction callback. */
export type MenuDatabase =
  | AppDatabase
  | PgTransaction<PostgresJsQueryResultHKT, MenuSchema, ExtractTablesWithRelations<MenuSchema>>;

export class DrizzleMenuRepository implements MenuRepository {
  constructor(private readonly db: MenuDatabase) {}

  async add(item: MenuItem): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(menuItems).values(itemRow(item));
        await insertIngredients(tx, item);
        await insertModifiers(tx, item);
      });
    } catch (error) {
      if (isMenuItemPrimaryKeyViolation(error)) {
        throw new MenuItemAlreadyExistsError();
      }
      throw error;
    }
  }

  async save(item: MenuItem): Promise<void> {
    await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(menuItems)
        .set(itemRow(item))
        .where(eq(menuItems.id, item.id))
        .returning({ id: menuItems.id });

      if (updated.length === 0) {
        throw new MenuItemNotFoundError();
      }

      await tx.delete(menuItemModifiers).where(eq(menuItemModifiers.menuItemId, item.id));
      await tx.delete(menuItemIngredients).where(eq(menuItemIngredients.menuItemId, item.id));
      await insertIngredients(tx, item);
      await insertModifiers(tx, item);
    });
  }

  async findById(id: string): Promise<MenuItem | null> {
    const rows = await this.db.select().from(menuItems).where(eq(menuItems.id, id));
    const stored = rows[0];
    if (stored === undefined) {
      return null;
    }

    const ingredients = await this.ingredientsOf(stored.id);
    const modifiers = await this.modifiersOf(stored.id);
    return toMenuItem(stored, ingredients, modifiers);
  }

  async list(): Promise<MenuItem[]> {
    const rows = await this.db.select().from(menuItems).orderBy(asc(menuItems.id));
    const ingredients = await this.db
      .select()
      .from(menuItemIngredients)
      .orderBy(asc(menuItemIngredients.position), asc(menuItemIngredients.id));
    const modifiers = await this.db
      .select()
      .from(menuItemModifiers)
      .orderBy(asc(menuItemModifiers.position), asc(menuItemModifiers.id));
    const ingredientsByItem = groupRows(ingredients);
    const modifiersByItem = groupRows(modifiers);

    return rows.map((row) => {
      const storedIngredients = ingredientsByItem.get(row.id);
      const storedModifiers = modifiersByItem.get(row.id);
      return toMenuItem(
        row,
        storedIngredients === undefined ? [] : storedIngredients,
        storedModifiers === undefined ? [] : storedModifiers,
      );
    });
  }

  private ingredientsOf(menuItemId: string): Promise<MenuItemIngredientRow[]> {
    return this.db
      .select()
      .from(menuItemIngredients)
      .where(eq(menuItemIngredients.menuItemId, menuItemId))
      .orderBy(asc(menuItemIngredients.position), asc(menuItemIngredients.id));
  }

  private modifiersOf(menuItemId: string): Promise<MenuItemModifierRow[]> {
    return this.db
      .select()
      .from(menuItemModifiers)
      .where(eq(menuItemModifiers.menuItemId, menuItemId))
      .orderBy(asc(menuItemModifiers.position), asc(menuItemModifiers.id));
  }
}

async function insertIngredients(tx: MenuDatabase, item: MenuItem): Promise<void> {
  const ingredients = item.ingredients;
  if (ingredients.length === 0) {
    return;
  }

  await tx.insert(menuItemIngredients).values(
    ingredients.map((ingredient, position) => ingredientRow(item.id, ingredient, position)),
  );
}

async function insertModifiers(tx: MenuDatabase, item: MenuItem): Promise<void> {
  const modifiers = item.modifiers;
  if (modifiers.length === 0) {
    return;
  }

  await tx.insert(menuItemModifiers).values(
    modifiers.map((modifier, position) => modifierRow(item, modifier, position)),
  );
}

function itemRow(item: MenuItem): MenuItemRow {
  return {
    id: item.id,
    name: item.name,
    priceAmount: item.price.amount,
    priceCurrency: item.price.currency,
    taxBasisPoints: item.applicableTax.basisPoints,
    active: item.active,
  };
}

function ingredientRow(menuItemId: string, ingredient: Ingredient, position: number) {
  return {
    id: ingredient.id,
    menuItemId,
    name: ingredient.name,
    position,
  };
}

function modifierRow(item: MenuItem, modifier: Modifier, position: number) {
  const price = modifier.price;

  return {
    id: modifier.id,
    menuItemId: item.id,
    name: modifier.name,
    kind: modifier.kind,
    ingredientId: ingredientIdOf(item, modifier),
    priceAmount: price === null ? null : price.amount,
    priceCurrency: price === null ? null : price.currency,
    position,
  };
}

function ingredientIdOf(item: MenuItem, modifier: Modifier): string | null {
  if (modifier.kind !== 'exclusion') {
    return null;
  }

  const ingredient = item.ingredients.find((candidate) => candidate.name === modifier.name);
  if (ingredient === undefined) {
    throw new ExclusionUnknownIngredientError();
  }

  return ingredient.id;
}

function groupRows<Row extends { menuItemId: string }>(rows: Row[]): Map<string, Row[]> {
  const grouped = new Map<string, Row[]>();

  for (const row of rows) {
    const current = grouped.get(row.menuItemId);
    if (current === undefined) {
      grouped.set(row.menuItemId, [row]);
    } else {
      current.push(row);
    }
  }

  return grouped;
}

function isMenuItemPrimaryKeyViolation(error: unknown): boolean {
  if (error instanceof postgres.PostgresError) {
    return error.code === '23505' && error.constraint_name === 'menu_items_pkey';
  }

  if (typeof error === 'object' && error !== null && 'cause' in error) {
    return isMenuItemPrimaryKeyViolation(error.cause);
  }

  return false;
}

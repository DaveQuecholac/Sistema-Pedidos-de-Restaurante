import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, integer, pgTable, text, unique } from 'drizzle-orm/pg-core';

export const menuItems = pgTable(
  'menu_items',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    priceAmount: integer('price_amount').notNull(),
    priceCurrency: text('price_currency').notNull(),
    taxBasisPoints: integer('tax_basis_points').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    check('menu_items_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check('menu_items_price_amount_gte_0', sql`${table.priceAmount} >= 0`),
    check('menu_items_price_currency_len_3', sql`length(${table.priceCurrency}) = 3`),
    check('menu_items_tax_basis_points_gte_0', sql`${table.taxBasisPoints} >= 0`),
  ],
);

export const menuItemIngredients = pgTable(
  'menu_item_ingredients',
  {
    id: text('id').primaryKey(),
    menuItemId: text('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
  },
  (table) => [
    check('menu_item_ingredients_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check('menu_item_ingredients_position_gte_0', sql`${table.position} >= 0`),
    unique('menu_item_ingredients_item_name').on(table.menuItemId, table.name),
    unique('menu_item_ingredients_id_item').on(table.id, table.menuItemId),
  ],
);

export const menuItemModifiers = pgTable(
  'menu_item_modifiers',
  {
    id: text('id').primaryKey(),
    menuItemId: text('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    ingredientId: text('ingredient_id'),
    priceAmount: integer('price_amount'),
    priceCurrency: text('price_currency'),
    position: integer('position').notNull().default(0),
  },
  (table) => [
    check('menu_item_modifiers_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check('menu_item_modifiers_kind', sql`${table.kind} in ('extra', 'exclusion')`),
    check('menu_item_modifiers_position_gte_0', sql`${table.position} >= 0`),
    check(
      'menu_item_modifiers_price_by_kind',
      sql`(
        (${table.kind} = 'extra' and ${table.ingredientId} is null and ${table.priceAmount} >= 0 and ${table.priceCurrency} is not null)
        or
        (${table.kind} = 'exclusion' and ${table.ingredientId} is not null and ${table.priceAmount} is null and ${table.priceCurrency} is null)
      )`,
    ),
    foreignKey({
      name: 'menu_item_modifiers_same_item_ingredient_fk',
      columns: [table.ingredientId, table.menuItemId],
      foreignColumns: [menuItemIngredients.id, menuItemIngredients.menuItemId],
    }).onDelete('cascade'),
  ],
);

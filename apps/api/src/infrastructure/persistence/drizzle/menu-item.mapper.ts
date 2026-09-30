import type { InferSelectModel } from 'drizzle-orm';
import { MenuItemMappingError } from '../../../application/menu/menu-item-repository.errors';
import { Ingredient } from '../../../domain/menu/ingredient';
import {
  BlankIdError,
  BlankNameError,
  DuplicateExclusionError,
  DuplicateIngredientNameError,
  ExclusionHasPriceError,
  ExclusionUnknownIngredientError,
  ExtraMissingPriceError,
} from '../../../domain/menu/menu-item.errors';
import { MenuItem } from '../../../domain/menu/menu-item';
import { Modifier } from '../../../domain/menu/modifier';
import { InvalidTaxRateError, TaxRate } from '../../../domain/menu/tax-rate';
import { InvalidMoneyError, Money } from '../../../domain/money/money';
import { menuItemIngredients, menuItemModifiers, menuItems } from './schema/menu';

export type MenuItemRow = InferSelectModel<typeof menuItems>;
export type MenuItemIngredientRow = InferSelectModel<typeof menuItemIngredients>;
export type MenuItemModifierRow = InferSelectModel<typeof menuItemModifiers>;

export function toMenuItem(
  item: MenuItemRow,
  ingredients: readonly MenuItemIngredientRow[],
  modifiers: readonly MenuItemModifierRow[],
): MenuItem {
  try {
    return MenuItem.restore({
      id: item.id,
      name: item.name,
      price: Money.of(item.priceAmount, item.priceCurrency),
      applicableTax: TaxRate.of(item.taxBasisPoints),
      active: item.active,
      ingredients: ingredients.map(toIngredient),
      modifiers: modifiers.map((row) => toModifier(row, ingredients)),
    });
  } catch (error) {
    if (isCatalogRuleError(error)) {
      throw new MenuItemMappingError();
    }
    throw error;
  }
}

function toIngredient(row: MenuItemIngredientRow): Ingredient {
  return Ingredient.of({ id: row.id, name: row.name });
}

function toModifier(row: MenuItemModifierRow, ingredients: readonly MenuItemIngredientRow[]): Modifier {
  const price = storedPrice(row.priceAmount, row.priceCurrency);

  if (row.kind === 'extra') {
    if (row.ingredientId !== null) {
      throw new MenuItemMappingError();
    }
    return Modifier.extra({ id: row.id, name: row.name, price });
  }

  if (row.kind === 'exclusion') {
    const ingredient = ingredients.find((candidate) => candidate.id === row.ingredientId);
    if (ingredient === undefined || ingredient.name !== row.name) {
      throw new MenuItemMappingError();
    }
    return Modifier.exclusion({ id: row.id, name: row.name, price });
  }

  throw new MenuItemMappingError();
}

function storedPrice(amount: number | null, currency: string | null): Money | null {
  if (amount === null && currency === null) {
    return null;
  }

  if (amount === null || currency === null) {
    throw new MenuItemMappingError();
  }

  return Money.of(amount, currency);
}

function isCatalogRuleError(error: unknown): boolean {
  return (
    error instanceof InvalidMoneyError ||
    error instanceof InvalidTaxRateError ||
    error instanceof ExtraMissingPriceError ||
    error instanceof ExclusionHasPriceError ||
    error instanceof ExclusionUnknownIngredientError ||
    error instanceof DuplicateIngredientNameError ||
    error instanceof DuplicateExclusionError ||
    error instanceof BlankNameError ||
    error instanceof BlankIdError
  );
}

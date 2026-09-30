import type { InferSelectModel } from 'drizzle-orm';
import { MenuItemMappingError } from '../../../application/menu/menu-item-repository.errors';
import {
  BlankIdError,
  BlankNameError,
  ExclusionHasPriceError,
  ExtraMissingPriceError,
} from '../../../domain/menu/menu-item.errors';
import { MenuItem } from '../../../domain/menu/menu-item';
import { Modifier } from '../../../domain/menu/modifier';
import { InvalidTaxRateError, TaxRate } from '../../../domain/menu/tax-rate';
import { InvalidMoneyError, Money } from '../../../domain/money/money';
import { menuItemModifiers, menuItems } from './schema/menu';

export type MenuItemRow = InferSelectModel<typeof menuItems>;
export type MenuItemModifierRow = InferSelectModel<typeof menuItemModifiers>;

export function toMenuItem(item: MenuItemRow, modifiers: readonly MenuItemModifierRow[]): MenuItem {
  try {
    return MenuItem.restore({
      id: item.id,
      name: item.name,
      price: Money.of(item.priceAmount, item.priceCurrency),
      applicableTax: TaxRate.of(item.taxBasisPoints),
      active: item.active,
      modifiers: modifiers.map(toModifier),
    });
  } catch (error) {
    if (isCatalogRuleError(error)) {
      throw new MenuItemMappingError();
    }
    throw error;
  }
}

function toModifier(row: MenuItemModifierRow): Modifier {
  const price = storedPrice(row.priceAmount, row.priceCurrency);

  if (row.kind === 'extra') {
    return Modifier.extra({ id: row.id, name: row.name, price });
  }

  if (row.kind === 'exclusion') {
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
    error instanceof BlankNameError ||
    error instanceof BlankIdError
  );
}

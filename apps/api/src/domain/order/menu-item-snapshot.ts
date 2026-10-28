import type { TaxRate } from '../menu/tax-rate';
import type { Money } from '../money/money';

/** Plain dish read from the catalog. The line freezes these fields and does not keep the class. */
export type MenuItemSnapshot = {
  readonly id: string;
  readonly name: string;
  readonly price: Money;
  readonly applicableTax: TaxRate;
  readonly active: boolean;
  readonly ingredients: readonly MenuIngredientSnapshot[];
  readonly modifiers: readonly MenuModifierSnapshot[];
};

export type MenuIngredientSnapshot = {
  readonly id: string;
  readonly name: string;
};

export type MenuModifierSnapshot = {
  readonly id: string;
  readonly name: string;
  readonly kind: 'extra' | 'exclusion';
  readonly price: Money | null;
};

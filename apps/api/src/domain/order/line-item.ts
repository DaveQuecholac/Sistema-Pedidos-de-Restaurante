import type { MenuItem } from '../menu/menu-item';
import {
  BlankIdError,
  BlankNameError,
  ExclusionHasPriceError,
  ExtraMissingPriceError,
  InvalidModifierKindError,
} from '../menu/menu-item.errors';
import type { Modifier, ModifierKind } from '../menu/modifier';
import type { TaxRate } from '../menu/tax-rate';
import type { Money } from '../money/money';
import {
  DuplicateModifierSelectionError,
  MenuItemUnavailableError,
  UnknownModifierError,
} from './order.errors';
import type { Quantity } from './quantity';

export type LineModifierRestoreInput = {
  modifierId: string;
  name: string;
  kind: string;
  price: Money | null;
};

export type LineItemRestoreInput = {
  id: string;
  menuItemId: string;
  name: string;
  unitPrice: Money;
  applicableTax: TaxRate;
  quantity: Quantity;
  modifiers: readonly LineModifierRestoreInput[];
};

/** Snapshot of a menu modifier chosen on a line. No link back to the live catalog row. */
export class LineModifier {
  private constructor(
    private readonly modifierIdValue: string,
    private readonly nameValue: string,
    private readonly kindValue: ModifierKind,
    private readonly priceValue: Money | null,
  ) {}

  static fromMenuModifier(modifier: Modifier): LineModifier {
    return new LineModifier(modifier.id, modifier.name, modifier.kind, modifier.price);
  }

  static restore(input: LineModifierRestoreInput): LineModifier {
    const modifierId = requireId(input.modifierId);
    const name = requireName(input.name);

    if (input.kind === 'extra') {
      if (input.price == null) {
        throw new ExtraMissingPriceError();
      }
      return new LineModifier(modifierId, name, 'extra', input.price);
    }

    if (input.kind === 'exclusion') {
      if (input.price != null) {
        throw new ExclusionHasPriceError();
      }
      return new LineModifier(modifierId, name, 'exclusion', null);
    }

    throw new InvalidModifierKindError();
  }

  get modifierId(): string {
    return this.modifierIdValue;
  }

  get name(): string {
    return this.nameValue;
  }

  get kind(): ModifierKind {
    return this.kindValue;
  }

  get price(): Money | null {
    return this.priceValue;
  }
}

/** Captured line: dish + quantity + chosen modifiers at the moment of capture. */
export class LineItem {
  private constructor(
    private readonly idValue: string,
    private readonly menuItemIdValue: string,
    private readonly nameValue: string,
    private readonly unitPriceValue: Money,
    private readonly applicableTaxValue: TaxRate,
    private readonly quantityValue: Quantity,
    private readonly modifiersValue: readonly LineModifier[],
  ) {}

  static capture(input: {
    id: string;
    menuItem: MenuItem;
    quantity: Quantity;
    modifierIds: readonly string[];
  }): LineItem {
    return LineItem.buildFromMenu(input.id, input.menuItem, input.quantity, input.modifierIds);
  }

  static restore(input: LineItemRestoreInput): LineItem {
    return new LineItem(
      requireId(input.id),
      requireId(input.menuItemId),
      requireName(input.name),
      input.unitPrice,
      input.applicableTax,
      input.quantity,
      input.modifiers.map((modifier) => LineModifier.restore(modifier)),
    );
  }

  recapture(input: {
    menuItem: MenuItem;
    quantity: Quantity;
    modifierIds: readonly string[];
  }): LineItem {
    return LineItem.buildFromMenu(this.idValue, input.menuItem, input.quantity, input.modifierIds);
  }

  get id(): string {
    return this.idValue;
  }

  get menuItemId(): string {
    return this.menuItemIdValue;
  }

  get name(): string {
    return this.nameValue;
  }

  get unitPrice(): Money {
    return this.unitPriceValue;
  }

  get applicableTax(): TaxRate {
    return this.applicableTaxValue;
  }

  get quantity(): Quantity {
    return this.quantityValue;
  }

  get modifiers(): LineModifier[] {
    return [...this.modifiersValue];
  }

  private static buildFromMenu(
    id: string,
    menuItem: MenuItem,
    quantity: Quantity,
    modifierIds: readonly string[],
  ): LineItem {
    if (!menuItem.active) {
      throw new MenuItemUnavailableError();
    }

    const selected = requireUniqueIds(modifierIds);
    const byId = new Map(menuItem.modifiers.map((modifier) => [modifier.id, modifier]));
    for (const modifierId of selected) {
      if (!byId.has(modifierId)) {
        throw new UnknownModifierError();
      }
    }

    const selectedSet = new Set(selected);
    const modifiers = menuItem.modifiers
      .filter((modifier) => selectedSet.has(modifier.id))
      .map((modifier) => LineModifier.fromMenuModifier(modifier));

    return new LineItem(
      requireId(id),
      menuItem.id,
      menuItem.name,
      menuItem.price,
      menuItem.applicableTax,
      quantity,
      modifiers,
    );
  }
}

function requireUniqueIds(modifierIds: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const modifierId of modifierIds) {
    if (seen.has(modifierId)) {
      throw new DuplicateModifierSelectionError();
    }
    seen.add(modifierId);
  }
  return [...modifierIds];
}

function requireId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    throw new BlankIdError();
  }
  return trimmed;
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new BlankNameError();
  }
  return trimmed;
}

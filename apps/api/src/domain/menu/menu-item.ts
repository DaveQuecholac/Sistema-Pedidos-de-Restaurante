import { Money } from '../money/money';
import { BlankIdError, BlankNameError } from './menu-item.errors';
import { Modifier } from './modifier';
import { TaxRate } from './tax-rate';

type MenuItemData = {
  id: string;
  name: string;
  price: Money;
  applicableTax: TaxRate;
  modifiers: readonly Modifier[];
};

type MenuItemReplacement = {
  name: string;
  price: Money;
  applicableTax: TaxRate;
  active: boolean;
  modifiers: readonly Modifier[];
};

export class MenuItem {
  private constructor(
    private readonly idValue: string,
    private readonly nameValue: string,
    private readonly priceValue: Money,
    private readonly applicableTaxValue: TaxRate,
    private readonly modifiersValue: readonly Modifier[],
    private readonly activeValue: boolean,
  ) {}

  static create(input: MenuItemData): MenuItem {
    return MenuItem.build({ ...input, active: true });
  }

  static restore(input: MenuItemData & { active: boolean }): MenuItem {
    return MenuItem.build(input);
  }

  deactivate(): MenuItem {
    if (!this.activeValue) {
      return this;
    }

    return new MenuItem(
      this.idValue,
      this.nameValue,
      this.priceValue,
      this.applicableTaxValue,
      this.modifiersValue,
      false,
    );
  }

  replace(input: MenuItemReplacement): MenuItem {
    return MenuItem.build({ ...input, id: this.idValue });
  }

  get id(): string {
    return this.idValue;
  }

  get name(): string {
    return this.nameValue;
  }

  get price(): Money {
    return this.priceValue;
  }

  get applicableTax(): TaxRate {
    return this.applicableTaxValue;
  }

  get modifiers(): Modifier[] {
    return [...this.modifiersValue];
  }

  get active(): boolean {
    return this.activeValue;
  }

  private static build(input: MenuItemData & { active: boolean }): MenuItem {
    const modifiers = [...input.modifiers];

    return new MenuItem(
      requireId(input.id),
      requireName(input.name),
      input.price,
      input.applicableTax,
      modifiers,
      input.active,
    );
  }
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

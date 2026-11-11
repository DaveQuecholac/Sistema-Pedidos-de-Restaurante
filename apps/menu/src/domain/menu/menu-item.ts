import { Money } from '../money/money';
import { Ingredient } from './ingredient';
import {
  BlankIdError,
  BlankNameError,
  DuplicateExclusionError,
  DuplicateIngredientNameError,
  ExclusionUnknownIngredientError,
} from './menu-item.errors';
import { Modifier } from './modifier';
import { TaxRate } from './tax-rate';

type MenuItemData = {
  id: string;
  name: string;
  price: Money;
  applicableTax: TaxRate;
  ingredients: readonly Ingredient[];
  modifiers: readonly Modifier[];
};

type MenuItemReplacement = {
  name: string;
  price: Money;
  applicableTax: TaxRate;
  active: boolean;
  ingredients: readonly Ingredient[];
  modifiers: readonly Modifier[];
};

export class MenuItem {
  private constructor(
    private readonly idValue: string,
    private readonly nameValue: string,
    private readonly priceValue: Money,
    private readonly applicableTaxValue: TaxRate,
    private readonly ingredientsValue: readonly Ingredient[],
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
      this.ingredientsValue,
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

  get ingredients(): Ingredient[] {
    return [...this.ingredientsValue];
  }

  get modifiers(): Modifier[] {
    return [...this.modifiersValue];
  }

  get active(): boolean {
    return this.activeValue;
  }

  private static build(input: MenuItemData & { active: boolean }): MenuItem {
    const ingredients = requireIngredients(input.ingredients);
    const modifiers = requireModifiers(input.modifiers, ingredients);

    return new MenuItem(
      requireId(input.id),
      requireName(input.name),
      input.price,
      input.applicableTax,
      ingredients,
      modifiers,
      input.active,
    );
  }
}

function requireIngredients(ingredients: readonly Ingredient[]): Ingredient[] {
  const copy = [...ingredients];
  const names = new Set<string>();

  for (const ingredient of copy) {
    if (names.has(ingredient.name)) {
      throw new DuplicateIngredientNameError();
    }
    names.add(ingredient.name);
  }

  return copy;
}

function requireModifiers(modifiers: readonly Modifier[], ingredients: readonly Ingredient[]): Modifier[] {
  const copy = [...modifiers];
  const names = new Set(ingredients.map((ingredient) => ingredient.name));
  const omitted = new Set<string>();

  for (const modifier of copy) {
    if (modifier.kind !== 'exclusion') {
      continue;
    }
    if (!names.has(modifier.name)) {
      throw new ExclusionUnknownIngredientError();
    }
    if (omitted.has(modifier.name)) {
      throw new DuplicateExclusionError();
    }
    omitted.add(modifier.name);
  }

  return copy;
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

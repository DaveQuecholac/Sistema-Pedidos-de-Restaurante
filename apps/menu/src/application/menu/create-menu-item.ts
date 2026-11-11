import { Ingredient } from '../../domain/menu/ingredient';
import { MenuItem } from '../../domain/menu/menu-item';
import { Modifier } from '../../domain/menu/modifier';
import {
  ExclusionHasPriceError,
  ExtraMissingPriceError,
  InvalidModifierKindError,
} from '../../domain/menu/menu-item.errors';
import { Money } from '../../domain/money/money';
import { TaxRate } from '../../domain/menu/tax-rate';
import { MenuRepository } from '../ports/menu-repository';

export type ModifierDraft = {
  name: string;
  kind: string;
  price?: { amount: number; currency: string };
};

export type IngredientDraft = {
  name: string;
};

export type CreateMenuItemCommand = {
  name: string;
  price: { amount: number; currency: string };
  applicableTax: { basisPoints: number };
  ingredients: IngredientDraft[];
  modifiers: ModifierDraft[];
};

export class CreateMenuItem {
  constructor(
    private readonly menu: MenuRepository,
    private readonly generateId: () => string,
  ) {}

  async execute(command: CreateMenuItemCommand): Promise<MenuItem> {
    const id = this.generateId();
    const modifiers = command.modifiers.map((draft) => toModifier(draft, this.generateId()));
    const ingredients = command.ingredients.map((draft) => toIngredient(draft, this.generateId()));
    const item = MenuItem.create({
      id,
      name: command.name,
      price: Money.of(command.price.amount, command.price.currency),
      applicableTax: TaxRate.of(command.applicableTax.basisPoints),
      ingredients,
      modifiers,
    });

    await this.menu.add(item);
    return item;
  }
}

export function toIngredient(draft: IngredientDraft, id: string): Ingredient {
  return Ingredient.of({ id, name: draft.name });
}

export function toModifier(draft: ModifierDraft, id: string): Modifier {
  if (draft.kind === 'extra') {
    if (draft.price == null) {
      throw new ExtraMissingPriceError();
    }

    return Modifier.extra({
      id,
      name: draft.name,
      price: Money.of(draft.price.amount, draft.price.currency),
    });
  }

  if (draft.kind === 'exclusion') {
    if (draft.price != null) {
      throw new ExclusionHasPriceError();
    }

    return Modifier.exclusion({ id, name: draft.name });
  }

  throw new InvalidModifierKindError();
}

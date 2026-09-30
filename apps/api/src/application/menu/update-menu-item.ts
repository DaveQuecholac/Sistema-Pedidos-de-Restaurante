import { MenuItem } from '../../domain/menu/menu-item';
import { Money } from '../../domain/money/money';
import { TaxRate } from '../../domain/menu/tax-rate';
import { MenuRepository } from '../ports/menu-repository';
import { MenuItemNotFoundError } from './menu-item-repository.errors';
import { IngredientDraft, ModifierDraft, toIngredient, toModifier } from './create-menu-item';

export type UpdateMenuItemCommand = {
  id: string;
  name: string;
  price: { amount: number; currency: string };
  applicableTax: { basisPoints: number };
  active: boolean;
  ingredients: IngredientDraft[];
  modifiers: ModifierDraft[];
};

export class UpdateMenuItem {
  constructor(
    private readonly menu: MenuRepository,
    private readonly generateId: () => string,
  ) {}

  async execute(command: UpdateMenuItemCommand): Promise<MenuItem> {
    const current = await this.menu.findById(command.id);
    if (current == null) {
      throw new MenuItemNotFoundError();
    }

    const modifiers = command.modifiers.map((draft) => toModifier(draft, this.generateId()));
    const ingredients = command.ingredients.map((draft) => toIngredient(draft, this.generateId()));
    const replacement = current.replace({
      name: command.name,
      price: Money.of(command.price.amount, command.price.currency),
      applicableTax: TaxRate.of(command.applicableTax.basisPoints),
      active: command.active,
      ingredients,
      modifiers,
    });

    await this.menu.save(replacement);
    return replacement;
  }
}

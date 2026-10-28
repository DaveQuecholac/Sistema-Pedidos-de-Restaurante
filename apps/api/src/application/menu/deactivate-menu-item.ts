import { MenuItem } from '../../domain/menu/menu-item';
import { MenuRepository } from '../ports/menu-repository';
import { MenuItemNotFoundError } from './menu-item-repository.errors';

export class DeactivateMenuItem {
  constructor(private readonly menu: MenuRepository) {}

  async execute(id: string): Promise<MenuItem> {
    const current = await this.menu.findById(id);
    if (current == null) {
      throw new MenuItemNotFoundError();
    }

    if (!current.active) {
      return current;
    }

    const inactive = current.deactivate();
    await this.menu.save(inactive);
    return inactive;
  }
}

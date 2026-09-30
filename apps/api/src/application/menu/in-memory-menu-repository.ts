import { MenuItem } from '../../domain/menu/menu-item';
import { MenuRepository } from '../ports/menu-repository';
import { MenuItemAlreadyExistsError, MenuItemNotFoundError } from './menu-item-repository.errors';

/** Test double. Keeps the first-add order and never hands out the stored object. */
export class InMemoryMenuRepository implements MenuRepository {
  private readonly items = new Map<string, MenuItem>();

  async add(item: MenuItem): Promise<void> {
    if (this.items.has(item.id)) {
      throw new MenuItemAlreadyExistsError();
    }

    this.items.set(item.id, copy(item));
  }

  async save(item: MenuItem): Promise<void> {
    if (!this.items.has(item.id)) {
      throw new MenuItemNotFoundError();
    }

    this.items.set(item.id, copy(item));
  }

  async findById(id: string): Promise<MenuItem | null> {
    const stored = this.items.get(id);
    return stored === undefined ? null : copy(stored);
  }

  async list(): Promise<MenuItem[]> {
    return [...this.items.values()].map(copy);
  }
}

function copy(item: MenuItem): MenuItem {
  return MenuItem.restore({
    id: item.id,
    name: item.name,
    price: item.price,
    applicableTax: item.applicableTax,
    active: item.active,
    modifiers: item.modifiers,
  });
}

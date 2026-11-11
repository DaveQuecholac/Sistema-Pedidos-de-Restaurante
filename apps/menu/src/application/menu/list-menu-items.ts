import { MenuItem } from '../../domain/menu/menu-item';
import { MenuRepository } from '../ports/menu-repository';

export class ListMenuItems {
  constructor(private readonly menu: MenuRepository) {}

  async execute(): Promise<MenuItem[]> {
    return this.menu.list();
  }
}

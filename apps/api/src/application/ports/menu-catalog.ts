import type { MenuItemSnapshot } from '../../domain/order/menu-item-snapshot';

/** Read-only catalog. A missing id is null. A silent process is not null. */
export interface MenuCatalog {
  findById(id: string): Promise<MenuItemSnapshot | null>;
}

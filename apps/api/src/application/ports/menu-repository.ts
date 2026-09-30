import type { MenuItem } from '../../domain/menu/menu-item';

/** Driven port for the menu catalog. No SQL and no HTTP. */
export interface MenuRepository {
  add(item: MenuItem): Promise<void>;
  save(item: MenuItem): Promise<void>;
  findById(id: string): Promise<MenuItem | null>;
  list(): Promise<MenuItem[]>;
}

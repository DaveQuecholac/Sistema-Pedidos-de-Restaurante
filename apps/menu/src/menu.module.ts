import { DynamicModule, Module } from '@nestjs/common';
import { CreateMenuItem } from './application/menu/create-menu-item';
import { DeactivateMenuItem } from './application/menu/deactivate-menu-item';
import { ListMenuItems } from './application/menu/list-menu-items';
import { UpdateMenuItem } from './application/menu/update-menu-item';
import type { MenuRepository } from './application/ports/menu-repository';
import type { MenuDatabase } from './infrastructure/persistence/drizzle/drizzle-menu-repository';
import { DrizzleMenuRepository } from './infrastructure/persistence/drizzle/drizzle-menu-repository';
import { MenuItemController } from './interface/http/menu/menu-item.controller';

export const MENU_REPOSITORY = Symbol('MENU_REPOSITORY');

/** Composition root: menu database, catalog use cases, and the REST controller. */
@Module({})
export class MenuModule {
  static register(db: MenuDatabase): DynamicModule {
    return {
      module: MenuModule,
      controllers: [MenuItemController],
      providers: [
        {
          provide: MENU_REPOSITORY,
          useFactory: () => new DrizzleMenuRepository(db),
        },
        {
          provide: ListMenuItems,
          inject: [MENU_REPOSITORY],
          useFactory: (menu: MenuRepository) => new ListMenuItems(menu),
        },
        {
          provide: DeactivateMenuItem,
          inject: [MENU_REPOSITORY],
          useFactory: (menu: MenuRepository) => new DeactivateMenuItem(menu),
        },
        {
          provide: CreateMenuItem,
          inject: [MENU_REPOSITORY],
          useFactory: (menu: MenuRepository) => new CreateMenuItem(menu, () => crypto.randomUUID()),
        },
        {
          provide: UpdateMenuItem,
          inject: [MENU_REPOSITORY],
          useFactory: (menu: MenuRepository) => new UpdateMenuItem(menu, () => crypto.randomUUID()),
        },
      ],
    };
  }
}

import { DynamicModule, Module } from '@nestjs/common';
import { CheckDatabaseConnection } from './application/database/check-database-connection';
import { CreateMenuItem } from './application/menu/create-menu-item';
import { DeactivateMenuItem } from './application/menu/deactivate-menu-item';
import { ListMenuItems } from './application/menu/list-menu-items';
import { UpdateMenuItem } from './application/menu/update-menu-item';
import { DatabaseHealthPort } from './application/ports/database-health.port';
import { MenuRepository } from './application/ports/menu-repository';
import { AppDatabase } from './infrastructure/persistence/drizzle/client';
import { DrizzleDatabaseHealth } from './infrastructure/persistence/drizzle/drizzle-database-health';
import { DrizzleMenuRepository } from './infrastructure/persistence/drizzle/drizzle-menu-repository';
import { DatabaseHealthController } from './interface/http/controllers/database-health.controller';
import { HealthController } from './interface/http/controllers/health.controller';
import { MenuItemController } from './interface/http/menu/menu-item.controller';

export const DATABASE_HEALTH_PORT = Symbol('DATABASE_HEALTH_PORT');
export const MENU_REPOSITORY = Symbol('MENU_REPOSITORY');

/** Composition root: health, and the menu catalog through DrizzleMenuRepository. */
@Module({})
export class AppModule {
  static register(db: AppDatabase): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, DatabaseHealthController, MenuItemController],
      providers: [
        {
          provide: DATABASE_HEALTH_PORT,
          useValue: new DrizzleDatabaseHealth(db),
        },
        {
          provide: CheckDatabaseConnection,
          inject: [DATABASE_HEALTH_PORT],
          useFactory: (database: DatabaseHealthPort) => new CheckDatabaseConnection(database),
        },
        {
          provide: MENU_REPOSITORY,
          useValue: new DrizzleMenuRepository(db),
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

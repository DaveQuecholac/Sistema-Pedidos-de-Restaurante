import { DynamicModule, Module } from '@nestjs/common';
import { CheckDatabaseConnection } from './application/database/check-database-connection';
import { DatabaseHealthPort } from './application/ports/database-health.port';
import { AppDatabase } from './infrastructure/persistence/drizzle/client';
import { DrizzleDatabaseHealth } from './infrastructure/persistence/drizzle/drizzle-database-health';
import { DatabaseHealthController } from './interface/http/controllers/database-health.controller';
import { HealthController } from './interface/http/controllers/health.controller';

export const DATABASE_HEALTH_PORT = Symbol('DATABASE_HEALTH_PORT');

/**
 * Composition root — wires the Drizzle health adapter to CheckDatabaseConnection.
 */
@Module({})
export class AppModule {
  static register(db: AppDatabase): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, DatabaseHealthController],
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
      ],
    };
  }
}

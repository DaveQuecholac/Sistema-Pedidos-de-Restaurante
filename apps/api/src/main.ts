import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { CheckDatabaseConnection } from './application/database/check-database-connection';
import { DatabaseConnectionError } from './application/database/database-connection.error';
import { AppModule } from './app.module';
import { createDatabase } from './infrastructure/persistence/drizzle/client';
import { DrizzleDatabaseHealth } from './infrastructure/persistence/drizzle/drizzle-database-health';
import { loadApiEnv } from './load-api-env';

async function bootstrap() {
  loadApiEnv(resolve(__dirname, '../.env'));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const { client, db } = createDatabase(databaseUrl);

  try {
    await new CheckDatabaseConnection(new DrizzleDatabaseHealth(db)).execute();
  } catch (error) {
    await client.end({ timeout: 1 });
    console.error(error instanceof DatabaseConnectionError ? error.message : 'Database connection failed');
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule.register(db));
  app.enableCors();
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

void bootstrap();

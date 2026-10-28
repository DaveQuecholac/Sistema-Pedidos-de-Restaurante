import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { MenuRepository } from './application/ports/menu-repository';
import { assertDatabaseReachable, createDatabase } from './infrastructure/persistence/drizzle/client';
import { startMenuGrpcServer } from './interface/grpc/menu-grpc-server';
import { loadMenuEnv } from './load-menu-env';
import { MENU_REPOSITORY, MenuModule } from './menu.module';

async function bootstrap() {
  loadMenuEnv(resolve(__dirname, '../.env'));

  const databaseUrl = process.env.MENU_DATABASE_URL;
  if (!databaseUrl) {
    console.error('MENU_DATABASE_URL is required');
    process.exit(1);
  }

  const { client, db } = createDatabase(databaseUrl);
  try {
    await assertDatabaseReachable(client);
  } catch {
    await client.end({ timeout: 1 });
    console.error('Database connection failed');
    process.exit(1);
  }

  const app = await NestFactory.create(MenuModule.register(db));
  app.enableCors();
  const port = process.env.PORT ? Number(process.env.PORT) : 3002;
  await app.listen(port);

  const menu = app.get<MenuRepository>(MENU_REPOSITORY);
  const grpcUrl = process.env.MENU_GRPC_URL ?? 'localhost:50052';
  await startMenuGrpcServer(menu, grpcUrl);
}

void bootstrap();

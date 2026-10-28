import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { CheckDatabaseConnection } from './application/database/check-database-connection';
import { DatabaseConnectionError } from './application/database/database-connection.error';
import type { OrderRepository } from './application/ports/order-repository';
import { AppModule, ORDER_REPOSITORY } from './app.module';
import { createDatabase } from './infrastructure/persistence/drizzle/client';
import { DrizzleDatabaseHealth } from './infrastructure/persistence/drizzle/drizzle-database-health';
import { startActiveOrdersGrpcServer } from './interface/grpc/active-orders-grpc-server';
import { loadApiEnv } from './load-api-env';

async function bootstrap() {
  loadApiEnv(resolve(__dirname, '../.env'));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const paymentsGrpcUrl = process.env.PAYMENTS_GRPC_URL;
  if (!paymentsGrpcUrl) {
    console.error('PAYMENTS_GRPC_URL is required');
    process.exit(1);
  }

  const menuGrpcUrl = process.env.MENU_GRPC_URL;
  if (!menuGrpcUrl) {
    console.error('MENU_GRPC_URL is required');
    process.exit(1);
  }

  const salonGrpcUrl = process.env.SALON_GRPC_URL ?? 'localhost:50053';

  const { client, db } = createDatabase(databaseUrl);

  try {
    await new CheckDatabaseConnection(new DrizzleDatabaseHealth(db)).execute();
  } catch (error) {
    await client.end({ timeout: 1 });
    console.error(error instanceof DatabaseConnectionError ? error.message : 'Database connection failed');
    process.exit(1);
  }

  const app = await NestFactory.create(
    AppModule.register(db, paymentsGrpcUrl, menuGrpcUrl, salonGrpcUrl),
  );
  app.enableCors();
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);

  const orders = app.get<OrderRepository>(ORDER_REPOSITORY);
  const ordersGrpcUrl = process.env.ORDERS_GRPC_URL ?? 'localhost:50054';
  await startActiveOrdersGrpcServer(orders, ordersGrpcUrl);
}

void bootstrap();

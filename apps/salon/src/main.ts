import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { GetTable } from './application/table/get-table';
import { assertDatabaseReachable, createDatabase } from './infrastructure/persistence/drizzle/client';
import { startTableGrpcServer } from './interface/grpc/table-grpc-server';
import { loadSalonEnv } from './load-salon-env';
import { SalonModule } from './salon.module';

async function bootstrap() {
  loadSalonEnv(resolve(__dirname, '../.env'));

  const databaseUrl = process.env.SALON_DATABASE_URL;
  if (!databaseUrl) {
    console.error('SALON_DATABASE_URL is required');
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

  const ordersGrpcUrl = process.env.ORDERS_GRPC_URL ?? 'localhost:50054';
  const app = await NestFactory.create(SalonModule.register(db, ordersGrpcUrl));
  app.enableCors();
  const port = process.env.PORT ? Number(process.env.PORT) : 3003;
  await app.listen(port);

  const getTable = app.get(GetTable);
  const grpcUrl = process.env.SALON_GRPC_URL ?? 'localhost:50053';
  await startTableGrpcServer(getTable, grpcUrl);
}

void bootstrap();

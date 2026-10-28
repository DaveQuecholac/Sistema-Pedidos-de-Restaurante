import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { assertDatabaseReachable, createPaymentsDatabase } from './infrastructure/persistence/drizzle/client';
import { startPaymentGrpcServer } from './interface/grpc/payment-grpc-server';
import { loadPaymentsEnv } from './load-payments-env';
import { ChargePayment } from './application/payment/charge-payment';
import { GetReceipt } from './application/payment/get-receipt';
import { VoidPayment } from './application/payment/void-payment';
import { PaymentsModule } from './payments.module';

async function bootstrap() {
  loadPaymentsEnv(resolve(__dirname, '../.env'));

  const databaseUrl = process.env.PAYMENTS_DATABASE_URL;
  if (!databaseUrl) {
    console.error('PAYMENTS_DATABASE_URL is required');
    process.exit(1);
  }

  const { client, db } = createPaymentsDatabase(databaseUrl);
  try {
    await assertDatabaseReachable(client);
  } catch {
    await client.end({ timeout: 1 });
    console.error('Database connection failed');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(PaymentsModule.register(db));
  const url = process.env.PAYMENTS_GRPC_URL ?? 'localhost:50051';
  await startPaymentGrpcServer(
    {
      chargePayment: app.get(ChargePayment),
      voidPayment: app.get(VoidPayment),
      getReceipt: app.get(GetReceipt),
    },
    url,
  );
}

void bootstrap();

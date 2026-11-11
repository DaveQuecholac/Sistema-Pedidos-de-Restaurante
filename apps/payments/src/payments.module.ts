import { DynamicModule, Module } from '@nestjs/common';
import { ChargePayment } from './application/payment/charge-payment';
import { GetReceipt } from './application/payment/get-receipt';
import { VoidPayment } from './application/payment/void-payment';
import type { PaymentMethodPort } from './application/ports/payment-method-port';
import type { PaymentRepository } from './application/ports/payment-repository';
import {
  CardPaymentAdapter,
  CashPaymentAdapter,
  DigitalGatewayFakeAdapter,
} from './infrastructure/payment';
import type { PaymentsDatabase } from './infrastructure/persistence/drizzle/client';
import { DrizzlePaymentRepository } from './infrastructure/persistence/drizzle/drizzle-payment-repository';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');
export const PAYMENT_METHOD_PORTS = Symbol('PAYMENT_METHOD_PORTS');

/** Composition root: simulated methods and the payments database. No HTTP. */
@Module({})
export class PaymentsModule {
  static register(db: PaymentsDatabase): DynamicModule {
    return {
      module: PaymentsModule,
      providers: [
        {
          provide: PAYMENT_REPOSITORY,
          useFactory: () => new DrizzlePaymentRepository(db),
        },
        {
          provide: PAYMENT_METHOD_PORTS,
          useValue: [
            new CashPaymentAdapter(() => crypto.randomUUID()),
            new CardPaymentAdapter(() => crypto.randomUUID()),
            new DigitalGatewayFakeAdapter(() => crypto.randomUUID()),
          ] satisfies PaymentMethodPort[],
        },
        {
          provide: ChargePayment,
          inject: [PAYMENT_REPOSITORY, PAYMENT_METHOD_PORTS],
          useFactory: (payments: PaymentRepository, ports: PaymentMethodPort[]) =>
            new ChargePayment(payments, ports, () => crypto.randomUUID(), () => new Date()),
        },
        {
          provide: VoidPayment,
          inject: [PAYMENT_REPOSITORY],
          useFactory: (payments: PaymentRepository) => new VoidPayment(payments),
        },
        {
          provide: GetReceipt,
          inject: [PAYMENT_REPOSITORY],
          useFactory: (payments: PaymentRepository) => new GetReceipt(payments),
        },
      ],
    };
  }
}

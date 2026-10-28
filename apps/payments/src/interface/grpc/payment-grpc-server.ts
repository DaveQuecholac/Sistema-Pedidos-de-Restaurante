import { createRequire } from 'node:module';
import { loadSync, type ServiceDefinition } from '@grpc/proto-loader';
import {
  loadPackageDefinition,
  Server,
  ServerCredentials,
  type ServerUnaryCall,
  type ServiceError,
  type UntypedServiceImplementation,
} from '@grpc/grpc-js';
import type { ChargePayment } from '../../application/payment/charge-payment';
import type { GetReceipt } from '../../application/payment/get-receipt';
import type { VoidPayment } from '../../application/payment/void-payment';
import { Charge } from '../../domain/payment/charge';
import { Money } from '../../domain/money/money';
import type { Payment } from '../../domain/payment/payment';
import { PaymentDetails } from '../../domain/payment/payment-details';
import { InvalidPaymentMethodError } from '../../domain/payment/payment.errors';
import { isPaymentMethod } from '../../domain/payment/payment-method';
import { toServiceError } from './grpc-errors';

const nodeRequire = createRequire(__filename);

type ChargeMessage = {
  subjectId?: string;
  amount?: number;
  currency?: string;
  method?: string;
  tenderedAmount?: number;
  cardLast4?: string;
  payerReference?: string;
};

type ReceiptMessage = {
  paymentId: string;
  subjectId: string;
  method: string;
  amount: number;
  currency: string;
  tenderedAmount?: number;
  cardLast4?: string;
  payerReference?: string;
  reference: string;
  paidAt: string;
  status: string;
};

export type PaymentGrpcHandlers = {
  chargePayment: ChargePayment;
  voidPayment: VoidPayment;
  getReceipt: GetReceipt;
};

export function startPaymentGrpcServer(handlers: PaymentGrpcHandlers, url: string): Promise<Server> {
  const protoPath = nodeRequire.resolve('@restaurante/contracts/payment.proto');
  const definition = loadSync(protoPath, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: false,
    oneofs: true,
  });
  const loaded = loadPackageDefinition(definition) as unknown as {
    restaurante: {
      payments: {
        v1: {
          PaymentService: { service: ServiceDefinition };
        };
      };
    };
  };
  const service = loaded.restaurante.payments.v1.PaymentService.service;
  const implementation: UntypedServiceImplementation = {
    [rpcName(service, 'Charge')]: unary(async (request: ChargeMessage) => chargeReply(handlers, request)),
    [rpcName(service, 'Void')]: unary(async (request: { reference?: string }) => {
      await handlers.voidPayment.execute(request.reference ?? '');
      return {};
    }),
    [rpcName(service, 'GetReceipt')]: unary(async (request: { subjectId?: string }) => {
      const payment = await handlers.getReceipt.execute(request.subjectId ?? '');
      return payment === null ? {} : { receipt: toReceipt(payment) };
    }),
  };

  const server = new Server();
  server.addService(service, implementation);
  return new Promise((resolve, reject) => {
    server.bindAsync(url, ServerCredentials.createInsecure(), (error: Error | null) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(server);
    });
  });
}

function rpcName(service: ServiceDefinition, rpc: string): string {
  if (rpc in service) {
    return rpc;
  }
  const camel = rpc.charAt(0).toLowerCase() + rpc.slice(1);
  if (camel in service) {
    return camel;
  }
  throw new Error(`RPC ${rpc} is not in payment.proto`);
}

function unary<Request, Reply>(
  handle: (request: Request) => Promise<Reply>,
): (
  call: ServerUnaryCall<Request, Reply>,
  callback: (error: ServiceError | null, response?: Reply) => void,
) => void {
  return (call, callback) => {
    void handle(call.request).then(
      (response) => callback(null, response),
      (error: unknown) => callback(toServiceError(error)),
    );
  };
}

async function chargeReply(handlers: PaymentGrpcHandlers, request: ChargeMessage) {
  const result = await handlers.chargePayment.execute(toCharge(request));
  if (result.outcome === 'declined') {
    return { outcome: 'declined', reference: '', declineReason: result.reason };
  }
  return {
    outcome: 'approved',
    reference: result.payment.reference,
    declineReason: '',
    receipt: toReceipt(result.payment),
  };
}

function toCharge(request: ChargeMessage): Charge {
  if (request.amount === undefined || request.currency === undefined) {
    throw new InvalidPaymentMethodError();
  }
  const amount = Money.of(request.amount, request.currency);
  if (!isPaymentMethod(request.method)) {
    throw new InvalidPaymentMethodError();
  }
  if (request.method === 'cash') {
    if (request.tenderedAmount === undefined) {
      throw new InvalidPaymentMethodError();
    }
    return Charge.of({
      subjectId: request.subjectId ?? '',
      amount,
      details: PaymentDetails.cash(Money.of(request.tenderedAmount, request.currency)),
    });
  }
  if (request.method === 'card') {
    return Charge.of({
      subjectId: request.subjectId ?? '',
      amount,
      details: PaymentDetails.card(request.cardLast4),
    });
  }
  return Charge.of({
    subjectId: request.subjectId ?? '',
    amount,
    details: PaymentDetails.digitalGateway(request.payerReference),
  });
}

function toReceipt(payment: Payment): ReceiptMessage {
  const receipt: ReceiptMessage = {
    paymentId: payment.id,
    subjectId: payment.subjectId,
    method: payment.method,
    amount: payment.amount.amount,
    currency: payment.amount.currency,
    reference: payment.reference,
    paidAt: payment.paidAt.toISOString(),
    status: payment.status,
  };
  if (payment.details.method === 'cash') {
    receipt.tenderedAmount = payment.details.tendered.amount;
  } else if (payment.details.method === 'card') {
    receipt.cardLast4 = payment.details.cardLast4;
  } else {
    receipt.payerReference = payment.details.payerReference;
  }
  return receipt;
}

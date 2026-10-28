import { createRequire } from 'node:module';
import {
  credentials,
  loadPackageDefinition,
  status,
  type ChannelCredentials,
  type ServiceError,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import type { PaymentReceiptQuery } from '../../application/ports/payment-receipt-query';
import type {
  ChargeResult,
  PaymentDeclineReason,
  PaymentPort,
} from '../../application/ports/payment-port';
import { PaymentProcessorUnavailableError } from '../../application/payment/payment.errors';
import { Money } from '../../domain/money/money';
import type { ChargeRequest } from '../../domain/payment/charge-request';
import { Payment } from '../../domain/payment/payment';
import { PaymentDetails } from '../../domain/payment/payment-details';
import type { PaymentMethod } from '../../domain/payment/payment-method';
import { InvalidPaymentMethodError } from '../../domain/payment/payment.errors';

const nodeRequire = createRequire(__filename);

export type ChargeCall = {
  subjectId: string;
  amount: number;
  currency: string;
  method: string;
  tenderedAmount?: number;
  cardLast4?: string;
  payerReference?: string;
};

export type ChargeCallReply = {
  outcome?: string;
  reference?: string;
  declineReason?: string;
};

export type ReceiptCall = {
  paymentId?: string;
  subjectId?: string;
  method?: string;
  amount?: number;
  currency?: string;
  tenderedAmount?: number;
  cardLast4?: string;
  payerReference?: string;
  reference?: string;
  paidAt?: string;
  status?: string;
};

/** Narrow client so the adapter can be tested without a payments process. */
export interface PaymentGrpcCaller {
  charge(request: ChargeCall): Promise<ChargeCallReply>;
  void(reference: string): Promise<void>;
  getReceipt(subjectId: string): Promise<ReceiptCall | null>;
}

type PaymentServiceClient = {
  new (address: string, credentials: ChannelCredentials): object;
};

/**
 * One method per instance, same as the ports CloseOrder already maps.
 * The three instances share one caller.
 */
export class GrpcPaymentAdapter implements PaymentPort, PaymentReceiptQuery {
  constructor(
    private readonly caller: PaymentGrpcCaller,
    readonly method: PaymentMethod,
  ) {}

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    if (request.method !== this.method) {
      throw new Error('Payment adapter was called for another method');
    }

    let reply: ChargeCallReply;
    try {
      reply = await this.caller.charge(toChargeCall(request));
    } catch (error) {
      if (grpcCode(error) === status.UNAVAILABLE) {
        throw new PaymentProcessorUnavailableError();
      }
      throw error;
    }

    if (reply.outcome === 'declined') {
      return { outcome: 'declined', reason: declineReason(reply.declineReason) };
    }
    if (reply.outcome === 'approved' && reply.reference) {
      return { outcome: 'approved', reference: reply.reference };
    }
    throw new Error('Payment charge reply is incomplete');
  }

  async voidCharge(reference: string): Promise<void> {
    await this.caller.void(reference);
  }

  async findBySubjectId(subjectId: string): Promise<Payment | null> {
    const receipt = await this.caller.getReceipt(subjectId);
    if (receipt === null || receipt.status !== 'approved') {
      return null;
    }
    return toPayment(receipt);
  }
}

export function createPaymentGrpcCaller(url: string): PaymentGrpcCaller {
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
          PaymentService: PaymentServiceClient;
        };
      };
    };
  };
  const client = new loaded.restaurante.payments.v1.PaymentService(
    url,
    credentials.createInsecure(),
  );

  return {
    charge: (request) => unary<ChargeCall, ChargeCallReply>(client, 'Charge', request),
    void: async (reference) => {
      await unary<{ reference: string }, object>(client, 'Void', { reference });
    },
    getReceipt: async (subjectId) => {
      const reply = await unary<{ subjectId: string }, { receipt?: ReceiptCall }>(client, 'GetReceipt', {
        subjectId,
      });
      return reply.receipt ?? null;
    },
  };
}

function toChargeCall(request: ChargeRequest): ChargeCall {
  const call: ChargeCall = {
    subjectId: request.orderId,
    amount: request.amount.amount,
    currency: request.amount.currency,
    method: request.method,
  };
  if (request.details.method === 'cash') {
    call.tenderedAmount = request.details.tendered.amount;
  } else if (request.details.method === 'card') {
    call.cardLast4 = request.details.cardLast4;
  } else {
    call.payerReference = request.details.payerReference;
  }
  return call;
}

function toPayment(receipt: ReceiptCall): Payment {
  if (
    receipt.paymentId === undefined ||
    receipt.amount === undefined ||
    receipt.currency === undefined ||
    receipt.reference === undefined ||
    receipt.paidAt === undefined
  ) {
    throw new InvalidPaymentMethodError();
  }

  const amount = Money.of(receipt.amount, receipt.currency);
  return Payment.restore({
    id: receipt.paymentId,
    amount,
    details: toDetails(receipt, receipt.currency),
    reference: receipt.reference,
    paidAt: new Date(receipt.paidAt),
  });
}

function toDetails(receipt: ReceiptCall, currency: string): PaymentDetails {
  if (receipt.method === 'cash') {
    if (receipt.tenderedAmount === undefined) {
      throw new InvalidPaymentMethodError();
    }
    return PaymentDetails.cash(Money.of(receipt.tenderedAmount, currency));
  }
  if (receipt.method === 'card') {
    return PaymentDetails.card(receipt.cardLast4);
  }
  if (receipt.method === 'digitalGateway') {
    return PaymentDetails.digitalGateway(receipt.payerReference);
  }
  throw new InvalidPaymentMethodError();
}

function declineReason(value: string | undefined): PaymentDeclineReason {
  if (value === 'cardDeclined' || value === 'gatewayDeclined') {
    return value;
  }
  throw new Error('Payment decline reason is missing');
}

function grpcCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number') {
    return error.code;
  }
  return undefined;
}

function unary<Request, Reply>(client: object, rpc: string, request: Request): Promise<Reply> {
  const target = client as Record<string, unknown>;
  const camel = rpc.charAt(0).toLowerCase() + rpc.slice(1);
  const method = target[rpc] ?? target[camel];
  if (typeof method !== 'function') {
    return Promise.reject(new Error(`RPC ${rpc} is not on the payment client`));
  }

  return new Promise((resolve, reject) => {
    method.call(client, request, (error: ServiceError | null, response?: Reply) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(response as Reply);
    });
  });
}

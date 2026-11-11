import { status } from '@grpc/grpc-js';
import { describe, expect, it } from 'vitest';
import { InMemoryOrderRepository } from '../../application/order/in-memory-order-repository';
import { FIXED_NOW, idsOf, readyOrderL } from '../../application/order/order-test-fixtures';
import type { OrderRepository } from '../../application/ports/order-repository';
import { CloseOrder } from '../../application/payment/close-order';
import { ChargeRequest } from '../../domain/payment/charge-request';
import { PaymentDetails } from '../../domain/payment/payment-details';
import { Money } from '../../domain/money/money';
import {
  GrpcPaymentAdapter,
  type ChargeCall,
  type ChargeCallReply,
  type PaymentGrpcCaller,
  type ReceiptCall,
} from './grpc-payment-adapter';

const cashClose = {
  orderId: 'order-1',
  expectedTotal: 16420,
  payment: { method: 'cash' as const, tendered: 20000 },
};

class FakeCaller implements PaymentGrpcCaller {
  chargeResult: ChargeCallReply | Error = { outcome: 'approved', reference: 'cash-ref' };
  voidResult: Error | null = null;
  receipt: ReceiptCall | null = null;
  charges: ChargeCall[] = [];

  charge(request: ChargeCall): Promise<ChargeCallReply> {
    this.charges.push(request);
    if (this.chargeResult instanceof Error) {
      return Promise.reject(this.chargeResult);
    }
    return Promise.resolve(this.chargeResult);
  }

  void(): Promise<void> {
    if (this.voidResult) {
      return Promise.reject(this.voidResult);
    }
    return Promise.resolve();
  }

  getReceipt(): Promise<ReceiptCall | null> {
    return Promise.resolve(this.receipt);
  }
}

function grpcError(code: status): Error {
  const error = new Error('grpc') as Error & { code: number };
  error.code = code;
  return error;
}

function ports(caller: PaymentGrpcCaller): GrpcPaymentAdapter[] {
  return [
    new GrpcPaymentAdapter(caller, 'cash'),
    new GrpcPaymentAdapter(caller, 'card'),
    new GrpcPaymentAdapter(caller, 'digitalGateway'),
  ];
}

describe('GrpcPaymentAdapter', () => {
  it('maps an approved charge and sends the order id as subject id', async () => {
    const caller = new FakeCaller();
    const cash = new GrpcPaymentAdapter(caller, 'cash');

    const result = await cash.charge(
      ChargeRequest.of({
        orderId: 'order-1',
        amount: Money.of(16420, 'MXN'),
        details: PaymentDetails.cash(Money.of(20000, 'MXN')),
      }),
    );

    expect(result).toEqual({ outcome: 'approved', reference: 'cash-ref' });
    expect(caller.charges[0]).toMatchObject({
      subjectId: 'order-1',
      amount: 16420,
      currency: 'MXN',
      method: 'cash',
      tenderedAmount: 20000,
    });
  });

  it('maps a declined charge', async () => {
    const caller = new FakeCaller();
    caller.chargeResult = { outcome: 'declined', reference: '', declineReason: 'cardDeclined' };
    const card = new GrpcPaymentAdapter(caller, 'card');

    const result = await card.charge(
      ChargeRequest.of({
        orderId: 'order-1',
        amount: Money.of(16420, 'MXN'),
        details: PaymentDetails.card('0002'),
      }),
    );

    expect(result).toEqual({ outcome: 'declined', reason: 'cardDeclined' });
  });

  it('does not close the order when the charge is ALREADY_EXISTS', async () => {
    const caller = new FakeCaller();
    caller.chargeResult = grpcError(status.ALREADY_EXISTS);
    const orders = new InMemoryOrderRepository();
    await orders.add(readyOrderL());
    const useCase = new CloseOrder(orders, ports(caller), idsOf('pay-1'), () => FIXED_NOW);

    await expect(useCase.execute(cashClose)).rejects.toMatchObject({ code: status.ALREADY_EXISTS });

    const stored = await orders.findById('order-1');
    expect(stored?.status).toBe('READY');
    expect(stored?.payment).toBeNull();
  });

  it('turns a NOT_FOUND void into PaymentVoidFailedError when the save fails', async () => {
    const caller = new FakeCaller();
    caller.voidResult = grpcError(status.NOT_FOUND);
    const orders = new InMemoryOrderRepository();
    await orders.add(readyOrderL());
    const boom = new Error('boom');
    const failing: OrderRepository = {
      add: (order) => orders.add(order),
      findById: (id) => orders.findById(id),
      findByExternalOrderId: (externalOrderId) => orders.findByExternalOrderId(externalOrderId),
      findActiveByTableId: (tableId) => orders.findActiveByTableId(tableId),
      listActiveByTableId: (tableId) => orders.listActiveByTableId(tableId),
      listBySittingId: (sittingId) => orders.listBySittingId(sittingId),
      list: (filter) => orders.list(filter),
      async save() {
        throw boom;
      },
    };
    const useCase = new CloseOrder(failing, ports(caller), idsOf('pay-1'), () => FIXED_NOW);

    await expect(useCase.execute(cashClose)).rejects.toMatchObject({
      name: 'PaymentVoidFailedError',
      cause: boom,
    });

    const stored = await orders.findById('order-1');
    expect(stored?.status).toBe('READY');
    expect(stored?.payment).toBeNull();
  });

  it('rebuilds a cash payment from the receipt, including change', async () => {
    const caller = new FakeCaller();
    caller.receipt = {
      paymentId: 'pay-1',
      subjectId: 'order-1',
      method: 'cash',
      amount: 16420,
      currency: 'MXN',
      tenderedAmount: 20000,
      reference: 'cash-ref',
      paidAt: FIXED_NOW.toISOString(),
      status: 'approved',
    };
    const cash = new GrpcPaymentAdapter(caller, 'cash');

    const payment = await cash.findBySubjectId('order-1');

    expect(payment?.id).toBe('pay-1');
    expect(payment?.method).toBe('cash');
    expect(payment?.change?.amount).toBe(3580);
  });

  it('returns null when the receipt is missing', async () => {
    const cash = new GrpcPaymentAdapter(new FakeCaller(), 'cash');

    await expect(cash.findBySubjectId('order-1')).resolves.toBeNull();
  });
});

import { Money } from '../../domain/money/money';
import { ChargeRequest } from '../../domain/payment/charge-request';
import { Payment } from '../../domain/payment/payment';
import type { PaymentMethod } from '../../domain/payment/payment-method';
import { PaymentAmountMismatchError } from '../../domain/payment/payment.errors';
import { Order } from '../../domain/order/order';
import { OrderNotClosableError } from '../../domain/order/order.errors';
import { OrderNotFoundError } from '../order/order-repository.errors';
import type { OrderRepository } from '../ports/order-repository';
import type { PaymentPort } from '../ports/payment-port';
import { toPaymentDetails, type PaymentCommand } from './payment-command';
import {
  PaymentDeclinedError,
  PaymentMethodUnavailableError,
  PaymentPortConfigurationError,
  PaymentVoidFailedError,
} from './payment.errors';

export type CloseOrderCommand = {
  orderId: string;
  expectedTotal: number;
  payment: PaymentCommand;
};

export type ClosedOrder = {
  order: Order;
  payment: Payment;
};

export class CloseOrder {
  private readonly portsByMethod: Map<PaymentMethod, PaymentPort>;

  constructor(
    private readonly orders: OrderRepository,
    payments: readonly PaymentPort[],
    private readonly newPaymentId: () => string,
    private readonly now: () => Date,
  ) {
    this.portsByMethod = new Map();
    for (const port of payments) {
      if (this.portsByMethod.has(port.method)) {
        throw new PaymentPortConfigurationError();
      }
      this.portsByMethod.set(port.method, port);
    }
  }

  async execute(command: CloseOrderCommand): Promise<ClosedOrder> {
    const order = await this.orders.findById(command.orderId);
    if (order === null) {
      throw new OrderNotFoundError();
    }
    if (!order.canClose()) {
      throw new OrderNotClosableError();
    }

    const details = toPaymentDetails(command.payment);
    const expectedTotal = Money.of(command.expectedTotal, 'MXN');
    if (!expectedTotal.equals(order.totals().total)) {
      throw new PaymentAmountMismatchError();
    }

    const request = ChargeRequest.of({
      orderId: order.id,
      amount: order.totals().total,
      details,
    });

    const port = this.portsByMethod.get(request.method);
    if (port === undefined) {
      throw new PaymentMethodUnavailableError();
    }

    const result = await port.charge(request);
    if (result.outcome === 'declined') {
      throw new PaymentDeclinedError(result.reason);
    }

    const closed = await recordAndClose(order, request, result.reference, port, this.newPaymentId, this.now);

    try {
      await this.orders.save(closed);
    } catch (error) {
      await voidApprovedCharge(port, result.reference, error);
    }

    const saved = await this.orders.findById(order.id);
    if (saved === null || saved.payment === null) {
      throw new OrderNotFoundError();
    }

    return { order: saved, payment: saved.payment };
  }
}

async function recordAndClose(
  order: Order,
  request: ChargeRequest,
  reference: string,
  port: PaymentPort,
  newPaymentId: () => string,
  now: () => Date,
): Promise<Order> {
  try {
    const payment = Payment.record({
      id: newPaymentId(),
      request,
      reference,
      paidAt: now(),
    });
    return order.close(payment);
  } catch (error) {
    return voidApprovedCharge(port, reference, error);
  }
}

async function voidApprovedCharge(
  port: PaymentPort,
  reference: string,
  cause: unknown,
): Promise<never> {
  try {
    await port.voidCharge(reference);
  } catch {
    throw new PaymentVoidFailedError(cause);
  }
  throw cause;
}

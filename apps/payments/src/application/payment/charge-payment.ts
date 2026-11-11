import type { Charge } from '../../domain/payment/charge';
import { Payment } from '../../domain/payment/payment';
import type { PaymentMethod } from '../../domain/payment/payment-method';
import type { PaymentDeclineReason, PaymentMethodPort } from '../ports/payment-method-port';
import type { PaymentRepository } from '../ports/payment-repository';
import {
  PaymentAlreadyExistsError,
  PaymentMethodUnavailableError,
  PaymentPortConfigurationError,
} from './payment.errors';

export type ChargePaymentResult =
  | { outcome: 'approved'; payment: Payment }
  | { outcome: 'declined'; reason: PaymentDeclineReason };

export class ChargePayment {
  private readonly portsByMethod: Map<PaymentMethod, PaymentMethodPort>;

  constructor(
    private readonly payments: PaymentRepository,
    ports: readonly PaymentMethodPort[],
    private readonly newPaymentId: () => string,
    private readonly now: () => Date,
  ) {
    this.portsByMethod = new Map();
    for (const port of ports) {
      if (this.portsByMethod.has(port.method)) {
        throw new PaymentPortConfigurationError();
      }
      this.portsByMethod.set(port.method, port);
    }
  }

  async execute(charge: Charge): Promise<ChargePaymentResult> {
    const existing = await this.payments.findApprovedBySubjectId(charge.subjectId);
    if (existing) {
      if (existing.matches(charge)) {
        return { outcome: 'approved', payment: existing };
      }
      throw new PaymentAlreadyExistsError();
    }

    const port = this.portsByMethod.get(charge.method);
    if (port === undefined) {
      throw new PaymentMethodUnavailableError();
    }

    const result = await port.charge(charge);
    if (result.outcome === 'declined') {
      return result;
    }

    const payment = Payment.record({
      id: this.newPaymentId(),
      charge,
      reference: result.reference,
      paidAt: this.now(),
    });
    try {
      await this.payments.insert(payment);
    } catch (error) {
      if (!(error instanceof PaymentAlreadyExistsError)) {
        throw error;
      }
      const raced = await this.payments.findApprovedBySubjectId(charge.subjectId);
      if (raced?.matches(charge)) {
        return { outcome: 'approved', payment: raced };
      }
      throw error;
    }

    return { outcome: 'approved', payment };
  }
}

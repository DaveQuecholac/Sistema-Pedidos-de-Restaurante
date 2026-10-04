import type { ChargeRequest } from '../../domain/payment/charge-request';
import type { PaymentMethod } from '../../domain/payment/payment-method';
import type {
  ChargeResult,
  PaymentDeclineReason,
  PaymentPort,
} from '../ports/payment-port';
import { PaymentProcessorUnavailableError } from './payment.errors';

type ChargeBehavior =
  | { mode: 'approve'; reference: string }
  | { mode: 'decline'; reason: PaymentDeclineReason }
  | { mode: 'unavailable' };

/** Test double for PaymentPort. Records calls and is configured per test. */
export class FakePaymentPort implements PaymentPort {
  readonly charges: ChargeRequest[] = [];
  readonly voids: string[] = [];

  private chargeBehavior: ChargeBehavior = { mode: 'approve', reference: 'ref-1' };
  private voidShouldFail = false;

  constructor(readonly method: PaymentMethod) {}

  approveWith(reference: string): this {
    this.chargeBehavior = { mode: 'approve', reference };
    return this;
  }

  declineWith(reason: PaymentDeclineReason): this {
    this.chargeBehavior = { mode: 'decline', reason };
    return this;
  }

  failCharge(): this {
    this.chargeBehavior = { mode: 'unavailable' };
    return this;
  }

  failVoid(): this {
    this.voidShouldFail = true;
    return this;
  }

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    this.charges.push(request);

    if (this.chargeBehavior.mode === 'unavailable') {
      throw new PaymentProcessorUnavailableError();
    }
    if (this.chargeBehavior.mode === 'decline') {
      return { outcome: 'declined', reason: this.chargeBehavior.reason };
    }
    return { outcome: 'approved', reference: this.chargeBehavior.reference };
  }

  async voidCharge(reference: string): Promise<void> {
    this.voids.push(reference);
    if (this.voidShouldFail) {
      throw new PaymentProcessorUnavailableError();
    }
  }
}

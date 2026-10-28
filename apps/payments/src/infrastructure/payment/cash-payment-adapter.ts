import type { ChargeResult, PaymentMethodPort } from '../../application/ports/payment-method-port';
import type { Charge } from '../../domain/payment/charge';

/** Simulated cash drawer. Always approves; insufficient cash is rejected before calling. */
export class CashPaymentAdapter implements PaymentMethodPort {
  readonly method = 'cash' as const;
  readonly voidedReferences: string[] = [];

  constructor(private readonly newReferenceId: () => string) {}

  async charge(charge: Charge): Promise<ChargeResult> {
    if (charge.details.method !== 'cash') {
      throw new Error('CashPaymentAdapter received a charge request for another method');
    }

    return { outcome: 'approved', reference: `cash-${this.newReferenceId()}` };
  }

  async voidCharge(reference: string): Promise<void> {
    this.voidedReferences.push(reference);
  }
}

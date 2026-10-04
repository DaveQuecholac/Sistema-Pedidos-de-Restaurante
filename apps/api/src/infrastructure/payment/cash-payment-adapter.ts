import type { ChargeResult, PaymentPort } from '../../application/ports/payment-port';
import type { ChargeRequest } from '../../domain/payment/charge-request';

/** Simulated cash drawer. Always approves; insufficient cash is rejected in the core. */
export class CashPaymentAdapter implements PaymentPort {
  readonly method = 'cash' as const;
  readonly voidedReferences: string[] = [];

  constructor(private readonly newReferenceId: () => string) {}

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    if (request.details.method !== 'cash') {
      throw new Error('CashPaymentAdapter received a charge request for another method');
    }

    return { outcome: 'approved', reference: `cash-${this.newReferenceId()}` };
  }

  async voidCharge(reference: string): Promise<void> {
    this.voidedReferences.push(reference);
  }
}

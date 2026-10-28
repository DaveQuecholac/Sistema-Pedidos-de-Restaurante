import { PaymentProcessorUnavailableError } from '../../application/payment/payment.errors';
import type { ChargeResult, PaymentMethodPort } from '../../application/ports/payment-method-port';
import type { Charge } from '../../domain/payment/charge';

const DECLINED_LAST4 = '0002';
const UNAVAILABLE_LAST4 = '0119';

/** Simulated card terminal with fixed decline and outage triggers. */
export class CardPaymentAdapter implements PaymentMethodPort {
  readonly method = 'card' as const;
  readonly voidedReferences: string[] = [];

  constructor(private readonly newReferenceId: () => string) {}

  async charge(charge: Charge): Promise<ChargeResult> {
    if (charge.details.method !== 'card') {
      throw new Error('CardPaymentAdapter received a charge request for another method');
    }

    const last4 = charge.details.cardLast4;
    if (last4 === DECLINED_LAST4) {
      return { outcome: 'declined', reason: 'cardDeclined' };
    }
    if (last4 === UNAVAILABLE_LAST4) {
      throw new PaymentProcessorUnavailableError();
    }

    return { outcome: 'approved', reference: `card-${this.newReferenceId()}` };
  }

  async voidCharge(reference: string): Promise<void> {
    this.voidedReferences.push(reference);
  }
}

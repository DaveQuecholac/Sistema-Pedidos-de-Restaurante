import { PaymentProcessorUnavailableError } from '../../application/payment/payment.errors';
import type { ChargeResult, PaymentMethodPort } from '../../application/ports/payment-method-port';
import type { Charge } from '../../domain/payment/charge';

const DECLINED_REFERENCE = 'rechazo@pasarela.test';
const UNAVAILABLE_REFERENCE = 'caida@pasarela.test';

/** Simulated digital gateway with fixed decline and outage triggers. */
export class DigitalGatewayFakeAdapter implements PaymentMethodPort {
  readonly method = 'digitalGateway' as const;
  readonly voidedReferences: string[] = [];

  constructor(private readonly newReferenceId: () => string) {}

  async charge(charge: Charge): Promise<ChargeResult> {
    if (charge.details.method !== 'digitalGateway') {
      throw new Error('DigitalGatewayFakeAdapter received a charge request for another method');
    }

    const payerReference = charge.details.payerReference.toLowerCase();
    if (payerReference === DECLINED_REFERENCE) {
      return { outcome: 'declined', reason: 'gatewayDeclined' };
    }
    if (payerReference === UNAVAILABLE_REFERENCE) {
      throw new PaymentProcessorUnavailableError();
    }

    return { outcome: 'approved', reference: `gateway-${this.newReferenceId()}` };
  }

  async voidCharge(reference: string): Promise<void> {
    this.voidedReferences.push(reference);
  }
}

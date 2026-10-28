import { PaymentProcessorUnavailableError } from '../../application/payment/payment.errors';
import type { ChargeResult, PaymentPort } from '../../application/ports/payment-port';
import type { ChargeRequest } from '../../domain/payment/charge-request';

const DECLINED_REFERENCE = 'rechazo@pasarela.test';
const UNAVAILABLE_REFERENCE = 'caida@pasarela.test';

/** Simulated digital gateway with fixed decline and outage triggers. */
export class DigitalGatewayFakeAdapter implements PaymentPort {
  readonly method = 'digitalGateway' as const;
  readonly voidedReferences: string[] = [];

  constructor(private readonly newReferenceId: () => string) {}

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    if (request.details.method !== 'digitalGateway') {
      throw new Error('DigitalGatewayFakeAdapter received a charge request for another method');
    }

    const payerReference = request.details.payerReference.toLowerCase();
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

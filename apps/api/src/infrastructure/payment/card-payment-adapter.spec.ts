import { describe, expect, it } from 'vitest';
import { PaymentProcessorUnavailableError } from '../../application/payment/payment.errors';
import { Money } from '../../domain/money/money';
import { ChargeRequest } from '../../domain/payment/charge-request';
import { PaymentDetails } from '../../domain/payment/payment-details';
import { CardPaymentAdapter } from './card-payment-adapter';

function idsOf(...values: string[]): () => string {
  const pending = [...values];
  return () => {
    const next = pending.shift();
    if (next === undefined) {
      throw new Error('test id generator ran out');
    }
    return next;
  };
}

function cardRequest(cardLast4: string): ChargeRequest {
  return ChargeRequest.of({
    orderId: 'order-1',
    amount: Money.of(16420, 'MXN'),
    details: PaymentDetails.card(cardLast4),
  });
}

describe('CardPaymentAdapter', () => {
  it('approves card 4242 with card-r1 (A2)', async () => {
    const adapter = new CardPaymentAdapter(idsOf('r1'));
    const result = await adapter.charge(cardRequest('4242'));
    expect(result).toEqual({ outcome: 'approved', reference: 'card-r1' });
  });

  it('declines card 0002 (A3)', async () => {
    const adapter = new CardPaymentAdapter(idsOf('r1'));
    const result = await adapter.charge(cardRequest('0002'));
    expect(result).toEqual({ outcome: 'declined', reason: 'cardDeclined' });
  });

  it('throws when card is 0119 (A4)', async () => {
    const adapter = new CardPaymentAdapter(idsOf('r1'));
    await expect(adapter.charge(cardRequest('0119'))).rejects.toBeInstanceOf(
      PaymentProcessorUnavailableError,
    );
  });

  it('records voided references (A9)', async () => {
    const adapter = new CardPaymentAdapter(idsOf('r1'));
    await adapter.voidCharge('card-r1');
    expect(adapter.voidedReferences).toEqual(['card-r1']);
  });
});

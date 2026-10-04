import { describe, expect, it } from 'vitest';
import { Money } from '../../domain/money/money';
import { ChargeRequest } from '../../domain/payment/charge-request';
import { PaymentDetails } from '../../domain/payment/payment-details';
import { FakePaymentPort } from './fake-payment-port';
import { PaymentProcessorUnavailableError } from './payment.errors';

describe('FakePaymentPort', () => {
  const request = ChargeRequest.of({
    orderId: 'order-1',
    amount: Money.of(16420, 'MXN'),
    details: PaymentDetails.card('4242'),
  });

  it('approves with a fixed reference and records the request (FP1)', async () => {
    const port = new FakePaymentPort('card').approveWith('ref-1');
    const result = await port.charge(request);

    expect(result).toEqual({ outcome: 'approved', reference: 'ref-1' });
    expect(port.charges).toEqual([request]);
  });

  it('declines with a reason and records the request (FP2)', async () => {
    const port = new FakePaymentPort('card').declineWith('cardDeclined');
    const result = await port.charge(request);

    expect(result).toEqual({ outcome: 'declined', reason: 'cardDeclined' });
    expect(port.charges).toEqual([request]);
  });

  it('fails charge and void when configured (FP3)', async () => {
    const failingCharge = new FakePaymentPort('card').failCharge();
    await expect(failingCharge.charge(request)).rejects.toBeInstanceOf(
      PaymentProcessorUnavailableError,
    );
    expect(failingCharge.charges).toEqual([request]);

    const failingVoid = new FakePaymentPort('card').failVoid();
    await expect(failingVoid.voidCharge('ref-1')).rejects.toBeInstanceOf(
      PaymentProcessorUnavailableError,
    );
    expect(failingVoid.voids).toEqual(['ref-1']);
  });
});

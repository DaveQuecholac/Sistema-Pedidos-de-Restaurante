import { describe, expect, it } from 'vitest';
import { Money } from '../../domain/money/money';
import { ChargeRequest } from '../../domain/payment/charge-request';
import { PaymentDetails } from '../../domain/payment/payment-details';
import { CashPaymentAdapter } from './cash-payment-adapter';
import { CardPaymentAdapter } from './card-payment-adapter';
import { DigitalGatewayFakeAdapter } from './digital-gateway-fake-adapter';

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

const cashRequest = ChargeRequest.of({
  orderId: 'order-1',
  amount: Money.of(16420, 'MXN'),
  details: PaymentDetails.cash(Money.of(20000, 'MXN')),
});

const cardRequest = ChargeRequest.of({
  orderId: 'order-1',
  amount: Money.of(16420, 'MXN'),
  details: PaymentDetails.card('4242'),
});

const gatewayRequest = ChargeRequest.of({
  orderId: 'order-1',
  amount: Money.of(16420, 'MXN'),
  details: PaymentDetails.digitalGateway('cliente@correo.mx'),
});

describe('CashPaymentAdapter', () => {
  it('approves cash and returns cash-r1 (A1)', async () => {
    const adapter = new CashPaymentAdapter(idsOf('r1'));
    const result = await adapter.charge(cashRequest);

    expect(adapter.method).toBe('cash');
    expect(result).toEqual({ outcome: 'approved', reference: 'cash-r1' });
  });

  it('rejects a charge request for another method (A8)', async () => {
    const cash = new CashPaymentAdapter(idsOf('r1'));
    const card = new CardPaymentAdapter(idsOf('r1'));
    const gateway = new DigitalGatewayFakeAdapter(idsOf('r1'));

    await expect(cash.charge(cardRequest)).rejects.toThrow();
    await expect(card.charge(cashRequest)).rejects.toThrow();
    await expect(gateway.charge(cashRequest)).rejects.toThrow();
  });

  it('is deterministic with the same generator and request (A10)', async () => {
    const firstCash = await new CashPaymentAdapter(idsOf('r1')).charge(cashRequest);
    const secondCash = await new CashPaymentAdapter(idsOf('r1')).charge(cashRequest);
    const firstCard = await new CardPaymentAdapter(idsOf('r1')).charge(cardRequest);
    const secondCard = await new CardPaymentAdapter(idsOf('r1')).charge(cardRequest);
    const firstGateway = await new DigitalGatewayFakeAdapter(idsOf('r1')).charge(gatewayRequest);
    const secondGateway = await new DigitalGatewayFakeAdapter(idsOf('r1')).charge(gatewayRequest);

    expect(firstCash).toEqual(secondCash);
    expect(firstCard).toEqual(secondCard);
    expect(firstGateway).toEqual(secondGateway);
  });
});

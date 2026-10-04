import { describe, expect, it } from 'vitest';
import { PaymentProcessorUnavailableError } from '../../application/payment/payment.errors';
import { Money } from '../../domain/money/money';
import { ChargeRequest } from '../../domain/payment/charge-request';
import { PaymentDetails } from '../../domain/payment/payment-details';
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

function gatewayRequest(payerReference: string): ChargeRequest {
  return ChargeRequest.of({
    orderId: 'order-1',
    amount: Money.of(16420, 'MXN'),
    details: PaymentDetails.digitalGateway(payerReference),
  });
}

describe('DigitalGatewayFakeAdapter', () => {
  it('approves a payer reference with gateway-r1 (A5)', async () => {
    const adapter = new DigitalGatewayFakeAdapter(idsOf('r1'));
    const result = await adapter.charge(gatewayRequest('cliente@correo.mx'));
    expect(result).toEqual({ outcome: 'approved', reference: 'gateway-r1' });
  });

  it('declines rechazo@pasarela.test case-insensitively (A6)', async () => {
    const adapter = new DigitalGatewayFakeAdapter(idsOf('r1', 'r2'));
    await expect(adapter.charge(gatewayRequest('rechazo@pasarela.test'))).resolves.toEqual({
      outcome: 'declined',
      reason: 'gatewayDeclined',
    });
    await expect(adapter.charge(gatewayRequest('RECHAZO@Pasarela.test'))).resolves.toEqual({
      outcome: 'declined',
      reason: 'gatewayDeclined',
    });
  });

  it('throws when payer reference is caida@pasarela.test (A7)', async () => {
    const adapter = new DigitalGatewayFakeAdapter(idsOf('r1'));
    await expect(adapter.charge(gatewayRequest('caida@pasarela.test'))).rejects.toBeInstanceOf(
      PaymentProcessorUnavailableError,
    );
  });
});

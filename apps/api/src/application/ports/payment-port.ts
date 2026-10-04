import type { ChargeRequest } from '../../domain/payment/charge-request';
import type { PaymentMethod } from '../../domain/payment/payment-method';

export type PaymentDeclineReason = 'cardDeclined' | 'gatewayDeclined';

export type ChargeResult =
  | { outcome: 'approved'; reference: string }
  | { outcome: 'declined'; reason: PaymentDeclineReason };

/** Driven port for charging. Speaks domain types only. */
export interface PaymentPort {
  readonly method: PaymentMethod;
  charge(request: ChargeRequest): Promise<ChargeResult>;
  voidCharge(reference: string): Promise<void>;
}

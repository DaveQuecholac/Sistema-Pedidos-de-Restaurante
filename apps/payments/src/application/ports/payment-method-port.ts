import type { Charge } from '../../domain/payment/charge';
import type { PaymentMethod } from '../../domain/payment/payment-method';

export type PaymentDeclineReason = 'cardDeclined' | 'gatewayDeclined';

export type ChargeResult =
  | { outcome: 'approved'; reference: string }
  | { outcome: 'declined'; reason: PaymentDeclineReason };

/** Driven port for one simulated method. Persistence and void live in the use cases. */
export interface PaymentMethodPort {
  readonly method: PaymentMethod;
  charge(charge: Charge): Promise<ChargeResult>;
  voidCharge(reference: string): Promise<void>;
}

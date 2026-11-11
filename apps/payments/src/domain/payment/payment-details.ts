import type { Money } from '../money/money';
import { InvalidCardLast4Error, InvalidPayerReferenceError } from './payment.errors';

export type PaymentDetails =
  | { readonly method: 'cash'; readonly tendered: Money }
  | { readonly method: 'card'; readonly cardLast4: string }
  | { readonly method: 'digitalGateway'; readonly payerReference: string };

const CARD_LAST4 = /^\d{4}$/;

export const PaymentDetails = {
  cash(tendered: Money): PaymentDetails {
    return Object.freeze({ method: 'cash' as const, tendered });
  },

  card(cardLast4: unknown): PaymentDetails {
    if (typeof cardLast4 !== 'string' || !CARD_LAST4.test(cardLast4)) {
      throw new InvalidCardLast4Error();
    }
    return Object.freeze({ method: 'card' as const, cardLast4 });
  },

  digitalGateway(payerReference: unknown): PaymentDetails {
    if (typeof payerReference !== 'string') {
      throw new InvalidPayerReferenceError();
    }
    const trimmed = payerReference.trim();
    if (trimmed.length < 3 || trimmed.length > 64) {
      throw new InvalidPayerReferenceError();
    }
    return Object.freeze({ method: 'digitalGateway' as const, payerReference: trimmed });
  },
};

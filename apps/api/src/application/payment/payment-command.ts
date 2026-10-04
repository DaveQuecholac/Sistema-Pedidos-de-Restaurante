import { Money } from '../../domain/money/money';
import { PaymentDetails } from '../../domain/payment/payment-details';
import { InvalidPaymentMethodError } from '../../domain/payment/payment.errors';

export type PaymentCommand =
  | { method: 'cash'; tendered: number }
  | { method: 'card'; cardLast4: string }
  | { method: 'digitalGateway'; payerReference: string };

export function toPaymentDetails(command: PaymentCommand): PaymentDetails {
  const method = (command as { method?: unknown }).method;

  if (method === 'cash') {
    return PaymentDetails.cash(
      Money.of((command as { tendered: number }).tendered, 'MXN'),
    );
  }

  if (method === 'card') {
    return PaymentDetails.card((command as { cardLast4: string }).cardLast4);
  }

  if (method === 'digitalGateway') {
    return PaymentDetails.digitalGateway(
      (command as { payerReference: string }).payerReference,
    );
  }

  throw new InvalidPaymentMethodError();
}

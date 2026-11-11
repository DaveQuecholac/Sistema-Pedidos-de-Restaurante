import { Money } from '../../../domain/money/money';
import { PaymentDetails } from '../../../domain/payment/payment-details';
import { Payment, type PaymentStatus } from '../../../domain/payment/payment';
import { isPaymentMethod } from '../../../domain/payment/payment-method';
import { payments } from './schema/payment';

export class PaymentMappingError extends Error {
  constructor() {
    super('Payment row could not be mapped');
    this.name = 'PaymentMappingError';
  }
}

export type PaymentRow = typeof payments.$inferSelect;

export function toPaymentRow(payment: Payment): typeof payments.$inferInsert {
  const details = payment.details;
  return {
    paymentId: payment.id,
    subjectId: payment.subjectId,
    method: payment.method,
    amount: payment.amount.amount,
    currency: payment.amount.currency,
    tenderedAmount: details.method === 'cash' ? details.tendered.amount : null,
    cardLast4: details.method === 'card' ? details.cardLast4 : null,
    payerReference: details.method === 'digitalGateway' ? details.payerReference : null,
    reference: payment.reference,
    paidAt: payment.paidAt,
    status: payment.status,
  };
}

export function toPayment(row: PaymentRow): Payment {
  if (!isPaymentMethod(row.method) || !isPaymentStatus(row.status)) {
    throw new PaymentMappingError();
  }

  const amount = Money.of(row.amount, row.currency);
  const details = detailsFromRow(row, amount.currency);
  return Payment.restore({
    id: row.paymentId,
    subjectId: row.subjectId,
    amount,
    details,
    reference: row.reference,
    paidAt: row.paidAt,
    status: row.status,
  });
}

function detailsFromRow(row: PaymentRow, currency: string): PaymentDetails {
  if (row.method === 'cash') {
    if (row.tenderedAmount === null) {
      throw new PaymentMappingError();
    }
    return PaymentDetails.cash(Money.of(row.tenderedAmount, currency));
  }
  if (row.method === 'card') {
    return PaymentDetails.card(row.cardLast4);
  }
  if (row.method === 'digitalGateway') {
    return PaymentDetails.digitalGateway(row.payerReference);
  }
  throw new PaymentMappingError();
}

function isPaymentStatus(value: string): value is PaymentStatus {
  return value === 'approved' || value === 'voided';
}

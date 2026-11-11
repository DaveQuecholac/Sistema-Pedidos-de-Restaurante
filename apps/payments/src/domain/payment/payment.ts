import type { Money } from '../money/money';
import type { Charge } from './charge';
import type { PaymentDetails } from './payment-details';
import type { PaymentMethod } from './payment-method';
import {
  InsufficientCashError,
  InvalidPaymentReferenceError,
  InvalidPaymentStatusError,
} from './payment.errors';

export type PaymentStatus = 'approved' | 'voided';

export class Payment {
  private constructor(
    private readonly idValue: string,
    private readonly subjectIdValue: string,
    private readonly amountValue: Money,
    private readonly detailsValue: PaymentDetails,
    private readonly referenceValue: string,
    private readonly paidAtValue: Date,
    private readonly statusValue: PaymentStatus,
  ) {}

  static record(input: {
    id: string;
    charge: Charge;
    reference: string;
    paidAt: Date;
  }): Payment {
    return Payment.create({
      id: input.id,
      subjectId: input.charge.subjectId,
      amount: input.charge.amount,
      details: input.charge.details,
      reference: input.reference,
      paidAt: input.paidAt,
      status: 'approved',
    });
  }

  static restore(input: {
    id: string;
    subjectId: string;
    amount: Money;
    details: PaymentDetails;
    reference: string;
    paidAt: Date;
    status: PaymentStatus;
  }): Payment {
    return Payment.create(input);
  }

  get id(): string {
    return this.idValue;
  }

  get subjectId(): string {
    return this.subjectIdValue;
  }

  get method(): PaymentMethod {
    return this.detailsValue.method;
  }

  get amount(): Money {
    return this.amountValue;
  }

  get details(): PaymentDetails {
    return this.detailsValue;
  }

  get reference(): string {
    return this.referenceValue;
  }

  get paidAt(): Date {
    return this.paidAtValue;
  }

  get status(): PaymentStatus {
    return this.statusValue;
  }

  matches(charge: Charge): boolean {
    return (
      this.statusValue === 'approved' &&
      this.method === charge.method &&
      this.amountValue.equals(charge.amount)
    );
  }

  private static create(input: {
    id: string;
    subjectId: string;
    amount: Money;
    details: PaymentDetails;
    reference: string;
    paidAt: Date;
    status: PaymentStatus;
  }): Payment {
    const reference = requirePaymentReference(input.reference);
    if (input.status !== 'approved' && input.status !== 'voided') {
      throw new InvalidPaymentStatusError();
    }
    if (input.details.method === 'cash' && input.amount.isGreaterThan(input.details.tendered)) {
      throw new InsufficientCashError();
    }

    return new Payment(
      input.id,
      input.subjectId,
      input.amount,
      input.details,
      reference,
      input.paidAt,
      input.status,
    );
  }
}

function requirePaymentReference(reference: string): string {
  const trimmed = reference.trim();
  if (trimmed.length < 1 || trimmed.length > 64) {
    throw new InvalidPaymentReferenceError();
  }
  return trimmed;
}

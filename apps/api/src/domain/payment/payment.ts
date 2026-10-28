import type { Money } from '../money/money';
import type { ChargeRequest } from './charge-request';
import type { PaymentDetails } from './payment-details';
import type { PaymentMethod } from './payment-method';
import { InsufficientCashError, InvalidPaymentReferenceError } from './payment.errors';

export class Payment {
  private constructor(
    private readonly idValue: string,
    private readonly amountValue: Money,
    private readonly detailsValue: PaymentDetails,
    private readonly referenceValue: string,
    private readonly paidAtValue: Date,
  ) {}

  static record(input: {
    id: string;
    request: ChargeRequest;
    reference: string;
    paidAt: Date;
  }): Payment {
    return Payment.create({
      id: input.id,
      amount: input.request.amount,
      details: input.request.details,
      reference: input.reference,
      paidAt: input.paidAt,
    });
  }

  static restore(input: {
    id: string;
    amount: Money;
    details: PaymentDetails;
    reference: string;
    paidAt: Date;
  }): Payment {
    return Payment.create(input);
  }

  get id(): string {
    return this.idValue;
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

  get change(): Money | null {
    if (this.detailsValue.method !== 'cash') {
      return null;
    }
    return this.detailsValue.tendered.subtract(this.amountValue);
  }

  private static create(input: {
    id: string;
    amount: Money;
    details: PaymentDetails;
    reference: string;
    paidAt: Date;
  }): Payment {
    const reference = requirePaymentReference(input.reference);
    if (input.details.method === 'cash' && input.amount.isGreaterThan(input.details.tendered)) {
      throw new InsufficientCashError();
    }

    return new Payment(input.id, input.amount, input.details, reference, input.paidAt);
  }
}

function requirePaymentReference(reference: string): string {
  const trimmed = reference.trim();
  if (trimmed.length < 1 || trimmed.length > 64) {
    throw new InvalidPaymentReferenceError();
  }
  return trimmed;
}

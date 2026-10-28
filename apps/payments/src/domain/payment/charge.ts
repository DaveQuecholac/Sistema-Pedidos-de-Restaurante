import type { Money } from '../money/money';
import type { PaymentDetails } from './payment-details';
import type { PaymentMethod } from './payment-method';
import { InsufficientCashError, InvalidSubjectIdError } from './payment.errors';

export class Charge {
  private constructor(
    private readonly subjectIdValue: string,
    private readonly amountValue: Money,
    private readonly detailsValue: PaymentDetails,
  ) {}

  static of(input: { subjectId: string; amount: Money; details: PaymentDetails }): Charge {
    const subjectId = input.subjectId.trim();
    if (subjectId.length < 1) {
      throw new InvalidSubjectIdError();
    }
    if (input.details.method === 'cash' && input.amount.isGreaterThan(input.details.tendered)) {
      throw new InsufficientCashError();
    }

    return new Charge(subjectId, input.amount, input.details);
  }

  get subjectId(): string {
    return this.subjectIdValue;
  }

  get amount(): Money {
    return this.amountValue;
  }

  get details(): PaymentDetails {
    return this.detailsValue;
  }

  get method(): PaymentMethod {
    return this.detailsValue.method;
  }
}

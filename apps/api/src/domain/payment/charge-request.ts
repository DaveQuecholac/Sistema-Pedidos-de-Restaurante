import type { Money } from '../money/money';
import type { PaymentDetails } from './payment-details';
import type { PaymentMethod } from './payment-method';
import { InsufficientCashError } from './payment.errors';

export class ChargeRequest {
  private constructor(
    private readonly orderIdValue: string,
    private readonly amountValue: Money,
    private readonly detailsValue: PaymentDetails,
  ) {}

  static of(input: {
    orderId: string;
    amount: Money;
    details: PaymentDetails;
  }): ChargeRequest {
    if (input.details.method === 'cash' && input.amount.isGreaterThan(input.details.tendered)) {
      throw new InsufficientCashError();
    }

    return new ChargeRequest(input.orderId, input.amount, input.details);
  }

  get orderId(): string {
    return this.orderIdValue;
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

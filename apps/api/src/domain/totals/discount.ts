import { Money } from '../money/money';
import { Percentage } from './percentage';
import { InvalidDiscountError } from './totals.errors';

export type AdjustmentKind = 'percentage' | 'fixedAmount';

export interface Discount {
  readonly kind: AdjustmentKind;
  amountFor(subtotal: Money): Money;
}

class PercentageDiscount implements Discount {
  readonly kind = 'percentage' as const;

  constructor(private readonly rate: Percentage) {}

  amountFor(subtotal: Money): Money {
    return subtotal.percentage(this.rate.basisPoints);
  }
}

class FixedAmountDiscount implements Discount {
  readonly kind = 'fixedAmount' as const;

  constructor(private readonly amount: Money) {
    if (amount.amount === 0) {
      throw new InvalidDiscountError();
    }
  }

  amountFor(subtotal: Money): Money {
    return this.amount.isGreaterThan(subtotal) ? subtotal : this.amount;
  }
}

export const Discount = {
  percentage(rate: Percentage): Discount {
    return new PercentageDiscount(rate);
  },

  fixedAmount(amount: Money): Discount {
    return new FixedAmountDiscount(amount);
  },
};

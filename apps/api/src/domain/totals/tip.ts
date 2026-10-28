import { Money } from '../money/money';
import { Percentage } from './percentage';
import { InvalidTipError } from './totals.errors';
import type { AdjustmentKind } from './discount';

export interface Tip {
  readonly kind: AdjustmentKind;
  amountFor(base: Money): Money;
}

class PercentageTip implements Tip {
  readonly kind = 'percentage' as const;

  constructor(private readonly rate: Percentage) {}

  amountFor(base: Money): Money {
    return base.percentage(this.rate.basisPoints);
  }
}

class FixedAmountTip implements Tip {
  readonly kind = 'fixedAmount' as const;

  constructor(private readonly amount: Money) {
    if (amount.amount === 0) {
      throw new InvalidTipError();
    }
  }

  amountFor(_base: Money): Money {
    return this.amount;
  }
}

export const Tip = {
  percentage(rate: Percentage): Tip {
    return new PercentageTip(rate);
  },

  fixedAmount(amount: Money): Tip {
    return new FixedAmountTip(amount);
  },
};

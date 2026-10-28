import { Money } from '../../domain/money/money';
import { Discount } from '../../domain/totals/discount';
import { Percentage } from '../../domain/totals/percentage';
import { Tip } from '../../domain/totals/tip';
import { InvalidDiscountError, InvalidTipError } from '../../domain/totals/totals.errors';

export type AdjustmentCommand =
  | { kind: 'percentage'; basisPoints: number }
  | { kind: 'fixedAmount'; amount: number };

export function toDiscount(command: AdjustmentCommand): Discount {
  const kind = (command as { kind?: unknown }).kind;

  if (kind === 'percentage') {
    return Discount.percentage(
      Percentage.of((command as { basisPoints: number }).basisPoints),
    );
  }

  if (kind === 'fixedAmount') {
    return Discount.fixedAmount(
      Money.of((command as { amount: number }).amount, 'MXN'),
    );
  }

  throw new InvalidDiscountError();
}

export function toTip(command: AdjustmentCommand): Tip {
  const kind = (command as { kind?: unknown }).kind;

  if (kind === 'percentage') {
    return Tip.percentage(Percentage.of((command as { basisPoints: number }).basisPoints));
  }

  if (kind === 'fixedAmount') {
    return Tip.fixedAmount(Money.of((command as { amount: number }).amount, 'MXN'));
  }

  throw new InvalidTipError();
}

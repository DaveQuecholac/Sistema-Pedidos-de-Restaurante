import { InvalidMoneyError, MoneyOverflowError } from '../../../domain/money/money';
import { OrderTotalsNotAdjustableError } from '../../../domain/order/order.errors';
import {
  InvalidDiscountError,
  InvalidPercentageError,
  InvalidTipError,
} from '../../../domain/totals/totals.errors';
import { toOrderHttpError, type OrderHttpErrorBody } from '../order/order-http.errors';

type TotalsHttpError = {
  status: number;
  body: OrderHttpErrorBody;
};

const translations: ReadonlyArray<{
  accept: (error: unknown) => error is Error;
  status: number;
}> = [
  {
    accept: (error): error is InvalidPercentageError => error instanceof InvalidPercentageError,
    status: 422,
  },
  {
    accept: (error): error is InvalidDiscountError => error instanceof InvalidDiscountError,
    status: 422,
  },
  {
    accept: (error): error is InvalidTipError => error instanceof InvalidTipError,
    status: 422,
  },
  {
    accept: (error): error is InvalidMoneyError => error instanceof InvalidMoneyError,
    status: 422,
  },
  {
    accept: (error): error is MoneyOverflowError => error instanceof MoneyOverflowError,
    status: 422,
  },
  {
    accept: (error): error is OrderTotalsNotAdjustableError =>
      error instanceof OrderTotalsNotAdjustableError,
    status: 409,
  },
];

/** Totals-specific errors first; everything else reuses the order HTTP map. */
export function toTotalsHttpError(error: unknown): TotalsHttpError | null {
  const match = translations.find((entry) => entry.accept(error));
  if (match !== undefined && error instanceof Error) {
    return {
      status: match.status,
      body: { code: error.name, message: error.message },
    };
  }

  return toOrderHttpError(error);
}

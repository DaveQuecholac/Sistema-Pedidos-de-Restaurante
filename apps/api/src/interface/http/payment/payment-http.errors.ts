import { InvalidMoneyError } from '../../../domain/money/money';
import { OrderNotClosableError } from '../../../domain/order/order.errors';
import {
  InsufficientCashError,
  InvalidCardLast4Error,
  InvalidPayerReferenceError,
  InvalidPaymentMethodError,
  PaymentAmountMismatchError,
} from '../../../domain/payment/payment.errors';
import {
  PaymentDeclinedError,
  PaymentMethodUnavailableError,
  PaymentNotFoundError,
  PaymentProcessorUnavailableError,
  PaymentVoidFailedError,
} from '../../../application/payment/payment.errors';
import { toOrderHttpError, type OrderHttpErrorBody } from '../order/order-http.errors';

type PaymentHttpError = {
  status: number;
  body: OrderHttpErrorBody;
};

const translations: ReadonlyArray<{
  accept: (error: unknown) => error is Error;
  status: number;
}> = [
  {
    accept: (error): error is InvalidPaymentMethodError =>
      error instanceof InvalidPaymentMethodError,
    status: 422,
  },
  {
    accept: (error): error is InvalidCardLast4Error => error instanceof InvalidCardLast4Error,
    status: 422,
  },
  {
    accept: (error): error is InvalidPayerReferenceError =>
      error instanceof InvalidPayerReferenceError,
    status: 422,
  },
  {
    accept: (error): error is InvalidMoneyError => error instanceof InvalidMoneyError,
    status: 422,
  },
  {
    accept: (error): error is InsufficientCashError => error instanceof InsufficientCashError,
    status: 422,
  },
  {
    accept: (error): error is PaymentDeclinedError => error instanceof PaymentDeclinedError,
    status: 402,
  },
  {
    accept: (error): error is OrderNotClosableError => error instanceof OrderNotClosableError,
    status: 409,
  },
  {
    accept: (error): error is PaymentAmountMismatchError =>
      error instanceof PaymentAmountMismatchError,
    status: 409,
  },
  {
    accept: (error): error is PaymentNotFoundError => error instanceof PaymentNotFoundError,
    status: 404,
  },
  {
    accept: (error): error is PaymentProcessorUnavailableError =>
      error instanceof PaymentProcessorUnavailableError,
    status: 503,
  },
  {
    accept: (error): error is PaymentMethodUnavailableError =>
      error instanceof PaymentMethodUnavailableError,
    status: 503,
  },
  {
    accept: (error): error is PaymentVoidFailedError => error instanceof PaymentVoidFailedError,
    status: 500,
  },
];

/** Payment-specific errors first; everything else reuses the order HTTP map. */
export function toPaymentHttpError(error: unknown): PaymentHttpError | null {
  const match = translations.find((entry) => entry.accept(error));
  if (match !== undefined && error instanceof Error) {
    return {
      status: match.status,
      body: { code: error.name, message: error.message },
    };
  }

  return toOrderHttpError(error);
}

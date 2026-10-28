import { status, type ServiceError } from '@grpc/grpc-js';
import {
  PaymentAlreadyExistsError,
  PaymentProcessorUnavailableError,
  PaymentReferenceNotFoundError,
} from '../../application/payment/payment.errors';
import {
  InsufficientCashError,
  InvalidCardLast4Error,
  InvalidPaymentMethodError,
  InvalidPaymentReferenceError,
  InvalidPayerReferenceError,
  InvalidSubjectIdError,
} from '../../domain/payment/payment.errors';
import { InvalidMoneyError } from '../../domain/money/money';

export function toServiceError(error: unknown): ServiceError {
  const code = codeFor(error);
  const message = error instanceof Error ? error.message : 'Payment call failed';
  const serviceError = new Error(message) as ServiceError;
  serviceError.code = code;
  serviceError.details = message;
  return serviceError;
}

function codeFor(error: unknown): status {
  if (error instanceof PaymentAlreadyExistsError) {
    return status.ALREADY_EXISTS;
  }
  if (error instanceof PaymentReferenceNotFoundError) {
    return status.NOT_FOUND;
  }
  if (error instanceof PaymentProcessorUnavailableError) {
    return status.UNAVAILABLE;
  }
  if (
    error instanceof InvalidMoneyError ||
    error instanceof InvalidCardLast4Error ||
    error instanceof InvalidPayerReferenceError ||
    error instanceof InvalidPaymentMethodError ||
    error instanceof InvalidPaymentReferenceError ||
    error instanceof InvalidSubjectIdError ||
    error instanceof InsufficientCashError
  ) {
    return status.INVALID_ARGUMENT;
  }
  return status.INTERNAL;
}

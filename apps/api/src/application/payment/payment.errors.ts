import type { PaymentDeclineReason } from '../ports/payment-port';

export class PaymentMethodUnavailableError extends Error {
  constructor() {
    super('No payment adapter is configured for that method');
    this.name = 'PaymentMethodUnavailableError';
  }
}

export class PaymentPortConfigurationError extends Error {
  constructor() {
    super('Payment ports must not repeat a method');
    this.name = 'PaymentPortConfigurationError';
  }
}

export class PaymentProcessorUnavailableError extends Error {
  constructor() {
    super('Payment processor did not respond');
    this.name = 'PaymentProcessorUnavailableError';
  }
}

export class PaymentDeclinedError extends Error {
  readonly reason: PaymentDeclineReason;

  constructor(reason: PaymentDeclineReason) {
    super('Payment was declined by the processor');
    this.name = 'PaymentDeclinedError';
    this.reason = reason;
  }
}

export class PaymentVoidFailedError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super('Payment was approved but could not be voided after a save failure');
    this.name = 'PaymentVoidFailedError';
    this.cause = cause;
  }
}

export class PaymentNotFoundError extends Error {
  constructor() {
    super('Order has no recorded payment');
    this.name = 'PaymentNotFoundError';
  }
}

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

export class PaymentAlreadyExistsError extends Error {
  constructor() {
    super('An approved payment already exists for this subject with a different amount or method');
    this.name = 'PaymentAlreadyExistsError';
  }
}

export class PaymentReferenceNotFoundError extends Error {
  constructor() {
    super('Payment reference was not found');
    this.name = 'PaymentReferenceNotFoundError';
  }
}

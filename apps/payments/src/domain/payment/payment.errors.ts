export class InvalidPaymentMethodError extends Error {
  constructor() {
    super('Payment method must be cash, card or digitalGateway');
    this.name = 'InvalidPaymentMethodError';
  }
}

export class InvalidCardLast4Error extends Error {
  constructor() {
    super('Card last4 must be exactly 4 digits');
    this.name = 'InvalidCardLast4Error';
  }
}

export class InvalidPayerReferenceError extends Error {
  constructor() {
    super('Payer reference must be 3 to 64 characters after trim');
    this.name = 'InvalidPayerReferenceError';
  }
}

export class InsufficientCashError extends Error {
  constructor() {
    super('Cash tendered must cover the charge amount');
    this.name = 'InsufficientCashError';
  }
}

export class InvalidPaymentReferenceError extends Error {
  constructor() {
    super('Payment reference must be 1 to 64 characters after trim');
    this.name = 'InvalidPaymentReferenceError';
  }
}

export class InvalidSubjectIdError extends Error {
  constructor() {
    super('Payment subject id must not be blank');
    this.name = 'InvalidSubjectIdError';
  }
}

export class InvalidPaymentStatusError extends Error {
  constructor() {
    super('Payment status must be approved or voided');
    this.name = 'InvalidPaymentStatusError';
  }
}

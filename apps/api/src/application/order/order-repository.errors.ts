export class OrderNotFoundError extends Error {
  constructor() {
    super('Order was not found');
    this.name = 'OrderNotFoundError';
  }
}

export class OrderAlreadyExistsError extends Error {
  constructor() {
    super('Order already exists');
    this.name = 'OrderAlreadyExistsError';
  }
}

export class OrderConcurrencyError extends Error {
  constructor() {
    super('Order was changed by another operation');
    this.name = 'OrderConcurrencyError';
  }
}

export class ExternalOrderIdInUseError extends Error {
  constructor() {
    super('External order id is already in use');
    this.name = 'ExternalOrderIdInUseError';
  }
}

export class OrderMappingError extends Error {
  constructor() {
    super('Stored order does not match the order rules');
    this.name = 'OrderMappingError';
  }
}

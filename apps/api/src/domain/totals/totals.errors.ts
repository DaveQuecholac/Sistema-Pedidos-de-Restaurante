export class InvalidPercentageError extends Error {
  constructor() {
    super('Percentage must be an integer from 1 to 10000 basis points');
    this.name = 'InvalidPercentageError';
  }
}

export class InvalidDiscountError extends Error {
  constructor() {
    super('Discount fixed amount must be greater than zero');
    this.name = 'InvalidDiscountError';
  }
}

export class InvalidTipError extends Error {
  constructor() {
    super('Tip fixed amount must be greater than zero');
    this.name = 'InvalidTipError';
  }
}

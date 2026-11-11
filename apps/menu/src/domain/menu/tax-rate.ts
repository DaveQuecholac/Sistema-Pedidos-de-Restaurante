const MAX_BASIS_POINTS = 2_147_483_647;

export class InvalidTaxRateError extends Error {
  constructor() {
    super('Tax rate must be an integer from 0 to 2147483647 basis points');
    this.name = 'InvalidTaxRateError';
  }
}

export class TaxRate {
  private constructor(private readonly basisPointsValue: number) {}

  static of(basisPoints: number): TaxRate {
    if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > MAX_BASIS_POINTS) {
      throw new InvalidTaxRateError();
    }

    return new TaxRate(basisPoints);
  }

  get basisPoints(): number {
    return this.basisPointsValue;
  }
}

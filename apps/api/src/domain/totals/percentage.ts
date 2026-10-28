import { InvalidPercentageError } from './totals.errors';

const MIN_BASIS_POINTS = 1;
const MAX_BASIS_POINTS = 10_000;

export class Percentage {
  private constructor(private readonly basisPointsValue: number) {}

  static of(basisPoints: number): Percentage {
    if (
      !Number.isInteger(basisPoints) ||
      basisPoints < MIN_BASIS_POINTS ||
      basisPoints > MAX_BASIS_POINTS
    ) {
      throw new InvalidPercentageError();
    }

    return new Percentage(basisPoints);
  }

  get basisPoints(): number {
    return this.basisPointsValue;
  }
}

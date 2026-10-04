import { InvalidQuantityError } from './order.errors';

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 99;

/** Line quantity: integer 1–99. */
export class Quantity {
  private constructor(private readonly value: number) {}

  static of(quantity: number): Quantity {
    if (!Number.isInteger(quantity) || quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
      throw new InvalidQuantityError();
    }

    return new Quantity(quantity);
  }

  get amount(): number {
    return this.value;
  }
}

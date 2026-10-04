const MAX_MINOR_UNITS = 2_147_483_647;
const PERCENTAGE_SCALE = 10_000n;
const HALF_UP = 5_000n;

export class InvalidMoneyError extends Error {
  constructor() {
    super('Money must be an integer amount from 0 to 2147483647 in MXN');
    this.name = 'InvalidMoneyError';
  }
}

export class MoneyOverflowError extends Error {
  constructor() {
    super('Money result exceeds 2147483647 minor units');
    this.name = 'MoneyOverflowError';
  }
}

export class NegativeMoneyError extends Error {
  constructor() {
    super('Money subtraction would be negative');
    this.name = 'NegativeMoneyError';
  }
}

export class InvalidMultiplierError extends Error {
  constructor() {
    super('Money multiplier must be an integer greater than or equal to 0');
    this.name = 'InvalidMultiplierError';
  }
}

export class InvalidAllocationError extends Error {
  constructor() {
    super('Cannot allocate a positive amount with all zero weights');
    this.name = 'InvalidAllocationError';
  }
}

export class Money {
  private constructor(
    private readonly amountValue: number,
    private readonly currencyValue: string,
  ) {}

  static of(amount: number, currency: string): Money {
    if (!Number.isInteger(amount) || amount < 0 || amount > MAX_MINOR_UNITS || currency !== 'MXN') {
      throw new InvalidMoneyError();
    }

    return new Money(amount, currency);
  }

  static zero(currency: string): Money {
    return Money.of(0, currency);
  }

  get amount(): number {
    return this.amountValue;
  }

  get currency(): string {
    return this.currencyValue;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    const sum = this.amountValue + other.amountValue;
    if (sum > MAX_MINOR_UNITS) {
      throw new MoneyOverflowError();
    }
    return Money.of(sum, this.currencyValue);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    const difference = this.amountValue - other.amountValue;
    if (difference < 0) {
      throw new NegativeMoneyError();
    }
    return Money.of(difference, this.currencyValue);
  }

  times(multiplier: number): Money {
    if (!Number.isInteger(multiplier) || multiplier < 0) {
      throw new InvalidMultiplierError();
    }

    const product = BigInt(this.amountValue) * BigInt(multiplier);
    if (product > BigInt(MAX_MINOR_UNITS)) {
      throw new MoneyOverflowError();
    }
    return Money.of(Number(product), this.currencyValue);
  }

  percentage(basisPoints: number): Money {
    const result =
      (BigInt(this.amountValue) * BigInt(basisPoints) + HALF_UP) / PERCENTAGE_SCALE;
    if (result > BigInt(MAX_MINOR_UNITS)) {
      throw new MoneyOverflowError();
    }
    return Money.of(Number(result), this.currencyValue);
  }

  allocate(weights: readonly number[]): Money[] {
    if (this.amountValue === 0) {
      return weights.map(() => Money.zero(this.currencyValue));
    }

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight === 0) {
      throw new InvalidAllocationError();
    }

    const amount = BigInt(this.amountValue);
    const total = BigInt(totalWeight);
    const shares: number[] = [];
    const remainders: { index: number; remainder: bigint }[] = [];
    let allocated = 0;

    for (let index = 0; index < weights.length; index += 1) {
      const product = amount * BigInt(weights[index]!);
      const share = Number(product / total);
      shares.push(share);
      allocated += share;
      remainders.push({ index, remainder: product % total });
    }

    remainders.sort((left, right) => {
      if (left.remainder === right.remainder) {
        return left.index - right.index;
      }
      return left.remainder > right.remainder ? -1 : 1;
    });

    let leftover = this.amountValue - allocated;
    for (let offset = 0; offset < leftover; offset += 1) {
      shares[remainders[offset]!.index]! += 1;
    }

    return shares.map((share) => Money.of(share, this.currencyValue));
  }

  equals(other: Money): boolean {
    return this.amountValue === other.amountValue && this.currencyValue === other.currencyValue;
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amountValue > other.amountValue;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currencyValue !== other.currencyValue) {
      throw new InvalidMoneyError();
    }
  }
}

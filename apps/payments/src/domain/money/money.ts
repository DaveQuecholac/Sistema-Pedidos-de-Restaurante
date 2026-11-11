const MAX_MINOR_UNITS = 2_147_483_647;

export class InvalidMoneyError extends Error {
  constructor() {
    super('Money must be an integer amount from 0 to 2147483647 with a 3-letter currency');
    this.name = 'InvalidMoneyError';
  }
}

export class Money {
  private constructor(
    private readonly amountValue: number,
    private readonly currencyValue: string,
  ) {}

  static of(amount: number, currency: string): Money {
    if (!Number.isInteger(amount) || amount < 0 || amount > MAX_MINOR_UNITS || currency.length !== 3) {
      throw new InvalidMoneyError();
    }

    return new Money(amount, currency);
  }

  get amount(): number {
    return this.amountValue;
  }

  get currency(): string {
    return this.currencyValue;
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

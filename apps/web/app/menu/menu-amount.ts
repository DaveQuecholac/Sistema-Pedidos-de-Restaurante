export class InvalidMenuAmountError extends Error {
  constructor() {
    super('Amount text must be a non-negative number with at most two decimal places');
    this.name = 'InvalidMenuAmountError';
  }
}

export type CatalogStatus =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; items: readonly unknown[] };

const DECIMAL_TEXT = /^(\d+)(?:\.(\d{1,2}))?$/;

export function centavosToLabel(amount: number): string {
  const { whole, fraction } = splitHundredths(amount);
  return `$${whole}.${fraction}`;
}

export function pesosToCentavos(input: string): number {
  return textToHundredths(input);
}

export function basisPointsToPercentLabel(basisPoints: number): string {
  const { whole, fraction } = splitHundredths(basisPoints);
  return `${whole}.${fraction} %`;
}

export function percentToBasisPoints(input: string): number {
  return textToHundredths(input);
}

export function catalogView(status: CatalogStatus): 'loading' | 'error' | 'empty' | 'list' {
  if (status.kind === 'loading') {
    return 'loading';
  }
  if (status.kind === 'error') {
    return 'error';
  }
  return status.items.length === 0 ? 'empty' : 'list';
}

function splitHundredths(amount: number): { whole: string; fraction: string } {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new InvalidMenuAmountError();
  }

  const digits = String(amount).padStart(3, '0');
  return {
    whole: digits.slice(0, -2),
    fraction: digits.slice(-2),
  };
}

function textToHundredths(input: string): number {
  const match = DECIMAL_TEXT.exec(input.trim());
  if (!match) {
    throw new InvalidMenuAmountError();
  }

  const whole = digitsToInteger(match[1]);
  const fraction = digitsToInteger((match[2] ?? '').padEnd(2, '0'));
  const hundredths = whole * 100 + fraction;
  if (!Number.isSafeInteger(hundredths)) {
    throw new InvalidMenuAmountError();
  }
  return hundredths;
}

function digitsToInteger(digits: string): number {
  let value = 0;
  for (const char of digits) {
    value = value * 10 + (char.charCodeAt(0) - 48);
    if (!Number.isSafeInteger(value)) {
      throw new InvalidMenuAmountError();
    }
  }
  return value;
}

import { Money } from '../money/money';
import {
  BlankIdError,
  BlankNameError,
  ExclusionHasPriceError,
  ExtraMissingPriceError,
} from './menu-item.errors';

export type ModifierKind = 'extra' | 'exclusion';

type ModifierInput = {
  id: string;
  name: string;
  price?: Money | null;
};

export class Modifier {
  private constructor(
    private readonly idValue: string,
    private readonly nameValue: string,
    private readonly kindValue: ModifierKind,
    private readonly priceValue: Money | null,
  ) {}

  static extra(input: ModifierInput): Modifier {
    if (input.price == null) {
      throw new ExtraMissingPriceError();
    }

    return new Modifier(requireId(input.id), requireName(input.name), 'extra', input.price);
  }

  static exclusion(input: ModifierInput): Modifier {
    if (input.price != null) {
      throw new ExclusionHasPriceError();
    }

    return new Modifier(requireId(input.id), requireName(input.name), 'exclusion', null);
  }

  get id(): string {
    return this.idValue;
  }

  get name(): string {
    return this.nameValue;
  }

  get kind(): ModifierKind {
    return this.kindValue;
  }

  get price(): Money | null {
    return this.priceValue;
  }
}

function requireId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    throw new BlankIdError();
  }
  return trimmed;
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new BlankNameError();
  }
  return trimmed;
}

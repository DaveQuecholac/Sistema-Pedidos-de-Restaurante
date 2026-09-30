import { BlankIdError, BlankNameError } from './menu-item.errors';

export class Ingredient {
  private constructor(
    private readonly idValue: string,
    private readonly nameValue: string,
  ) {}

  static of(input: { id: string; name: string }): Ingredient {
    return new Ingredient(requireId(input.id), requireName(input.name));
  }

  get id(): string {
    return this.idValue;
  }

  get name(): string {
    return this.nameValue;
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

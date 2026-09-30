export class BlankIdError extends Error {
  constructor() {
    super('Id must not be blank');
    this.name = 'BlankIdError';
  }
}

export class BlankNameError extends Error {
  constructor() {
    super('Name must not be blank');
    this.name = 'BlankNameError';
  }
}

export class InvalidModifierKindError extends Error {
  constructor() {
    super('Modifier kind must be extra or exclusion');
    this.name = 'InvalidModifierKindError';
  }
}

export class ExtraMissingPriceError extends Error {
  constructor() {
    super('An extra modifier requires a price');
    this.name = 'ExtraMissingPriceError';
  }
}

export class ExclusionHasPriceError extends Error {
  constructor() {
    super('An exclusion modifier must not have a price');
    this.name = 'ExclusionHasPriceError';
  }
}

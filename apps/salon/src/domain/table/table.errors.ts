export class InvalidTableIdError extends Error {
  constructor() {
    super('Table id must be 1 to 40 characters after trim');
    this.name = 'InvalidTableIdError';
  }
}

export class InvalidTableLabelError extends Error {
  constructor() {
    super('Table label must not be blank after trim');
    this.name = 'InvalidTableLabelError';
  }
}

export class InvalidTableZoneError extends Error {
  constructor() {
    super('Table zone must not be blank after trim');
    this.name = 'InvalidTableZoneError';
  }
}

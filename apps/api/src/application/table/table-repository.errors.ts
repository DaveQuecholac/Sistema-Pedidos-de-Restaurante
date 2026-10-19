export class TableNotFoundError extends Error {
  constructor() {
    super('Table was not found');
    this.name = 'TableNotFoundError';
  }
}

export class TableAlreadyExistsError extends Error {
  constructor() {
    super('Table already exists');
    this.name = 'TableAlreadyExistsError';
  }
}

export class TableHasActiveOrderError extends Error {
  constructor() {
    super('Table has an active order and cannot be deactivated');
    this.name = 'TableHasActiveOrderError';
  }
}

export class TableInactiveError extends Error {
  constructor() {
    super('Table is inactive');
    this.name = 'TableInactiveError';
  }
}

export class TableAlreadyHasActiveOrderError extends Error {
  constructor() {
    super('Table already has an active order');
    this.name = 'TableAlreadyHasActiveOrderError';
  }
}

export class TableMappingError extends Error {
  constructor() {
    super('Stored table does not match the catalog rules');
    this.name = 'TableMappingError';
  }
}

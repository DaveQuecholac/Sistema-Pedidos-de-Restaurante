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

export class ActiveOrdersUnavailableError extends Error {
  constructor() {
    super('Active orders query is unavailable');
    this.name = 'ActiveOrdersUnavailableError';
  }
}

export class TableMappingError extends Error {
  constructor() {
    super('Stored table does not match the catalog rules');
    this.name = 'TableMappingError';
  }
}

export class MenuItemNotFoundError extends Error {
  constructor() {
    super('Menu item was not found');
    this.name = 'MenuItemNotFoundError';
  }
}

export class MenuItemAlreadyExistsError extends Error {
  constructor() {
    super('Menu item already exists');
    this.name = 'MenuItemAlreadyExistsError';
  }
}

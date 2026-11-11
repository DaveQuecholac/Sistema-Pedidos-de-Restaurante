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

export class MenuItemMappingError extends Error {
  constructor() {
    super('Stored menu item does not match the catalog rules');
    this.name = 'MenuItemMappingError';
  }
}

export class MenuCatalogUnavailableError extends Error {
  constructor() {
    super('Menu catalog did not respond');
    this.name = 'MenuCatalogUnavailableError';
  }
}

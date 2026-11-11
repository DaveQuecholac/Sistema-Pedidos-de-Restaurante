export class TableCatalogUnavailableError extends Error {
  constructor() {
    super('Table catalog did not respond');
    this.name = 'TableCatalogUnavailableError';
  }
}

/** Application failure when the database port cannot be reached. No HTTP status, no driver text. */
export class DatabaseConnectionError extends Error {
  constructor() {
    super('Database connection failed');
    this.name = 'DatabaseConnectionError';
  }
}

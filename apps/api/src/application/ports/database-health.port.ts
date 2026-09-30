/** Driven port: the app asks whether the database answers. No driver types. */
export interface DatabaseHealthPort {
  ping(): Promise<void>;
}

/** Driven port for the menu list cache. No Redis client in the use case. */
export interface MenuListCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

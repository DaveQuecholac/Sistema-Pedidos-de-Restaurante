import { createClient } from 'redis';
import type { MenuListCache } from '../../application/ports/menu-list-cache';

type CacheClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  connect(): Promise<unknown>;
  on(event: 'error', listener: (error: Error) => void): unknown;
};

/** Redis adapter. SET uses EX so the key dies with the catalog TTL. */
export class RedisMenuListCache implements MenuListCache {
  private constructor(private readonly client: CacheClient) {}

  static async open(url: string): Promise<RedisMenuListCache> {
    const client: CacheClient = createClient({ url });
    client.on('error', (error: Error) => {
      console.error(error.message);
    });
    await client.connect();
    return new RedisMenuListCache(client);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, { EX: ttlSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }
}

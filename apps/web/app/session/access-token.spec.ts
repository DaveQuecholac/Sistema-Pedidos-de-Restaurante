import { describe, expect, it } from 'vitest';
import { authorizationHeaders, clearStoredToken, readStoredToken, writeStoredToken } from './access-token';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

describe('access token storage', () => {
  it('sends Bearer only when a token is stored', () => {
    const storage = memoryStorage();
    expect(authorizationHeaders(storage)).toEqual({});
    writeStoredToken(storage, 'jwt-1');
    expect(readStoredToken(storage)).toBe('jwt-1');
    expect(authorizationHeaders(storage)).toEqual({ Authorization: 'Bearer jwt-1' });
    clearStoredToken(storage);
    expect(authorizationHeaders(storage)).toEqual({});
  });
});

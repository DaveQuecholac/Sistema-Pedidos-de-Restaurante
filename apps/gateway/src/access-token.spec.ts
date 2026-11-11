import { describe, expect, it } from 'vitest';
import { issueAccessToken, parseExpiresIn, readAccessToken } from './access-token';

describe('access token TTL', () => {
  it('reads 2h as 7200 seconds', () => {
    expect(parseExpiresIn('2h')).toBe(7200);
    expect(parseExpiresIn('15m')).toBe(900);
    expect(parseExpiresIn('30s')).toBe(30);
    expect(parseExpiresIn('7200')).toBe(7200);
  });

  it('rejects a blank or zero duration', () => {
    expect(() => parseExpiresIn('')).toThrow(/JWT_EXPIRES_IN/);
    expect(() => parseExpiresIn('0h')).toThrow(/JWT_EXPIRES_IN/);
    expect(() => parseExpiresIn('soon')).toThrow(/JWT_EXPIRES_IN/);
  });

  it('accepts a token inside the TTL and rejects it at exp', () => {
    const token = issueAccessToken('waiter', 'secret', 7200, 1_000);
    expect(readAccessToken(token, 'secret', 1_000)).toBe('waiter');
    expect(readAccessToken(token, 'secret', 8_199)).toBe('waiter');
    expect(readAccessToken(token, 'secret', 8_200)).toBeNull();
  });

  it('rejects another secret or a truncated token', () => {
    const token = issueAccessToken('kitchen', 'secret', 60, 10);
    expect(readAccessToken(token, 'other', 10)).toBeNull();
    expect(readAccessToken(token.slice(0, -2), 'secret', 10)).toBeNull();
  });
});

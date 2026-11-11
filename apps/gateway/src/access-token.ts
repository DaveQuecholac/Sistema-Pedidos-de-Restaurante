import { createHmac, timingSafeEqual } from 'node:crypto';

export const STAFF_ROLES = ['waiter', 'cashier', 'kitchen'] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(value: unknown): value is StaffRole {
  return value === 'waiter' || value === 'cashier' || value === 'kitchen';
}

/** `2h`, `15m`, `30s`, or a positive number of seconds. */
export function parseExpiresIn(raw: string): number {
  const match = /^(\d+)(s|m|h)?$/.exec(raw.trim());
  if (match === null) {
    throw new Error('JWT_EXPIRES_IN must look like 7200, 30s, 15m or 2h');
  }

  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('JWT_EXPIRES_IN must be a positive duration');
  }

  const unit = match[2] ?? 's';
  if (unit === 'h') {
    return amount * 3600;
  }
  if (unit === 'm') {
    return amount * 60;
  }
  return amount;
}

export function issueAccessToken(
  role: StaffRole,
  secret: string,
  expiresInSeconds: number,
  nowSeconds: number,
): string {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    sub: role,
    role,
    iat: nowSeconds,
    exp: nowSeconds + expiresInSeconds,
  });
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${signature(signingInput, secret)}`;
}

/** The staff role when the signature and exp are valid. */
export function readAccessToken(token: string, secret: string, nowSeconds: number): StaffRole | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, claimed] = parts;
  if (header === undefined || payload === undefined || claimed === undefined) {
    return null;
  }

  const signingInput = `${header}.${payload}`;
  if (!safeEqual(signature(signingInput, secret), claimed)) {
    return null;
  }

  const decoded = decode(payload);
  if (decoded === null || !isStaffRole(decoded.role) || decoded.sub !== decoded.role) {
    return null;
  }
  if (!Number.isInteger(decoded.exp) || decoded.exp <= nowSeconds) {
    return null;
  }

  return decoded.role;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signature(signingInput: string, secret: string): string {
  return createHmac('sha256', secret).update(signingInput).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function decode(segment: string): { role: unknown; sub: unknown; exp: number } | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const record = parsed as { role?: unknown; sub?: unknown; exp?: unknown };
    if (typeof record.exp !== 'number') {
      return null;
    }
    return { role: record.role, sub: record.sub, exp: record.exp };
  } catch {
    return null;
  }
}

import type { StaffRole } from './staff-role';

export const ACCESS_TOKEN_KEY = 'restaurante.accessToken';

export function readStoredToken(storage: Pick<Storage, 'getItem'>): string | null {
  const value = storage.getItem(ACCESS_TOKEN_KEY);
  if (value === null || value.trim() === '') {
    return null;
  }
  return value;
}

export function writeStoredToken(storage: Pick<Storage, 'setItem'>, token: string): void {
  storage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearStoredToken(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(ACCESS_TOKEN_KEY);
}

export function authorizationHeaders(storage: Pick<Storage, 'getItem'> | null): Record<string, string> {
  if (storage === null) {
    return {};
  }
  const token = readStoredToken(storage);
  if (token === null) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

export function browserAuthorizationHeaders(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }
  return authorizationHeaders(window.sessionStorage);
}

export async function issueAccessToken(role: StaffRole): Promise<string> {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error('Falta NEXT_PUBLIC_API_URL.');
  }

  const base = raw.trim().replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
  } catch {
    throw new Error('No se pudo contactar el gateway.');
  }

  if (!response.ok) {
    throw new Error('El gateway no emitió el token.');
  }

  const payload: unknown = await response.json();
  if (typeof payload !== 'object' || payload === null || !('accessToken' in payload)) {
    throw new Error('El gateway no emitió el token.');
  }
  const token = (payload as { accessToken?: unknown }).accessToken;
  if (typeof token !== 'string' || token === '') {
    throw new Error('El gateway no emitió el token.');
  }
  return token;
}

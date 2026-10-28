import { describe, expect, it } from 'vitest';
import {
  clearStoredRole,
  readStoredRole,
  roleAllowsPath,
  roleHome,
  writeStoredRole,
} from './staff-role';

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

describe('staff role views', () => {
  it('sends each area to its home', () => {
    expect(roleHome('waiter')).toBe('/');
    expect(roleHome('cashier')).toBe('/pago');
    expect(roleHome('kitchen')).toBe('/cocina');
  });

  it('keeps the waiter on mesas and comandas', () => {
    expect(roleAllowsPath('waiter', '/')).toBe(true);
    expect(roleAllowsPath('waiter', '/ordenes')).toBe(true);
    expect(roleAllowsPath('waiter', '/ordenes/abc')).toBe(true);
    expect(roleAllowsPath('waiter', '/cocina')).toBe(false);
    expect(roleAllowsPath('waiter', '/pago')).toBe(false);
    expect(roleAllowsPath('waiter', '/pago/abc/cuenta')).toBe(false);
    expect(roleAllowsPath('waiter', '/menu')).toBe(false);
    expect(roleAllowsPath('waiter', '/mesas/admin')).toBe(false);
  });

  it('keeps the cashier on the payment screens', () => {
    expect(roleAllowsPath('cashier', '/pago')).toBe(true);
    expect(roleAllowsPath('cashier', '/pago/abc/cuenta')).toBe(true);
    expect(roleAllowsPath('cashier', '/pago/abc/cobro')).toBe(true);
    expect(roleAllowsPath('cashier', '/')).toBe(false);
    expect(roleAllowsPath('cashier', '/ordenes/abc')).toBe(false);
    expect(roleAllowsPath('cashier', '/cocina')).toBe(false);
  });

  it('keeps the kitchen on the kitchen screen', () => {
    expect(roleAllowsPath('kitchen', '/cocina')).toBe(true);
    expect(roleAllowsPath('kitchen', '/')).toBe(false);
    expect(roleAllowsPath('kitchen', '/pago')).toBe(false);
    expect(roleAllowsPath('kitchen', '/ordenes')).toBe(false);
  });

  it('remembers the chosen area', () => {
    const storage = memoryStorage();
    expect(readStoredRole(storage)).toBeNull();
    writeStoredRole(storage, 'kitchen');
    expect(readStoredRole(storage)).toBe('kitchen');
    clearStoredRole(storage);
    expect(readStoredRole(storage)).toBeNull();
  });

  it('ignores a stored value that is not an area', () => {
    const storage = memoryStorage();
    storage.setItem('restaurante.staffRole', 'admin');
    expect(readStoredRole(storage)).toBeNull();
  });
});

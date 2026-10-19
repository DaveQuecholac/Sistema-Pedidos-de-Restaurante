import { describe, expect, it } from 'vitest';
import { orderIdFromPath, shortOrderLabel } from './order-id-from-path';

describe('orderIdFromPath', () => {
  it('reads ordenes and pago nested routes', () => {
    expect(orderIdFromPath('/ordenes/abc-123')).toBe('abc-123');
    expect(orderIdFromPath('/ordenes/abc-123/cuenta')).toBe('abc-123');
    expect(orderIdFromPath('/pago/abc-123/cuenta')).toBe('abc-123');
    expect(orderIdFromPath('/pago/abc-123/cobro')).toBe('abc-123');
  });

  it('returns null outside order routes', () => {
    expect(orderIdFromPath('/')).toBeNull();
    expect(orderIdFromPath('/ordenes')).toBeNull();
    expect(orderIdFromPath('/pago')).toBeNull();
    expect(orderIdFromPath('/cocina')).toBeNull();
  });
});

describe('shortOrderLabel', () => {
  it('shortens long ids', () => {
    expect(shortOrderLabel('abcdef12-3456')).toBe('ABCDEF12');
  });
});

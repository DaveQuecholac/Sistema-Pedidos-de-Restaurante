import { describe, expect, it } from 'vitest';
import { OrderOrigin } from './order-origin';
import {
  InvalidExternalOrderIdError,
  InvalidOrderOriginError,
  InvalidTableIdError,
} from './order.errors';

describe('OrderOrigin', () => {
  it('trims a table id and leaves externalOrderId null (O1)', () => {
    const origin = OrderOrigin.table('  5 ');

    expect(origin.tableId).toBe('5');
    expect(origin.externalOrderId).toBeNull();
  });

  it('accepts an external id and leaves tableId null (O2)', () => {
    const origin = OrderOrigin.external('UBER-123');

    expect(origin.externalOrderId).toBe('UBER-123');
    expect(origin.tableId).toBeNull();
  });

  it('rejects an empty table id (O3)', () => {
    expect(() => OrderOrigin.table('')).toThrow(InvalidTableIdError);
  });

  it('rejects a blank table id (O3)', () => {
    expect(() => OrderOrigin.table('   ')).toThrow(InvalidTableIdError);
  });

  it('rejects a table id longer than 40 characters (O4)', () => {
    expect(() => OrderOrigin.table('a'.repeat(41))).toThrow(InvalidTableIdError);
  });

  it('accepts a table id of exactly 40 characters (O4)', () => {
    const tableId = 'a'.repeat(40);
    expect(OrderOrigin.table(tableId).tableId).toBe(tableId);
  });

  it('rejects an empty external order id (O5)', () => {
    expect(() => OrderOrigin.external('')).toThrow(InvalidExternalOrderIdError);
  });

  it('rejects an external order id longer than 64 characters (O5)', () => {
    expect(() => OrderOrigin.external('a'.repeat(65))).toThrow(InvalidExternalOrderIdError);
  });

  it('accepts an external order id of exactly 64 characters (O5)', () => {
    const externalOrderId = 'a'.repeat(64);
    expect(OrderOrigin.external(externalOrderId).externalOrderId).toBe(externalOrderId);
  });

  it('rejects both tableId and externalOrderId from HTTP-shaped input (O6)', () => {
    expect(() =>
      OrderOrigin.fromInput({ tableId: '5', externalOrderId: 'UBER-1' }),
    ).toThrow(InvalidOrderOriginError);
  });

  it('rejects neither tableId nor externalOrderId from HTTP-shaped input (O7)', () => {
    expect(() => OrderOrigin.fromInput({})).toThrow(InvalidOrderOriginError);
  });

  it('rejects both fields when they arrive as undefined (O7)', () => {
    expect(() =>
      OrderOrigin.fromInput({ tableId: undefined, externalOrderId: undefined }),
    ).toThrow(InvalidOrderOriginError);
  });
});

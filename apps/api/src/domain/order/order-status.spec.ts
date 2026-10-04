import { describe, expect, it } from 'vitest';
import { InvalidOrderTransitionError } from './order.errors';
import {
  ORDER_STATUSES,
  ORDER_TRANSITION_ACTIONS,
  orderStatus,
  type OrderStatus,
  type OrderTransitionAction,
} from './order-status';

/**
 * Expected `next(action)` result for every status × action pair (S8).
 * `null` means InvalidOrderTransitionError.
 */
const NEXT_TABLE: Record<OrderStatus, Record<OrderTransitionAction, OrderStatus | null>> = {
  OPEN: {
    editLines: null,
    startCooking: 'IN_KITCHEN',
    markReady: null,
    cancel: 'CANCELLED',
  },
  IN_KITCHEN: {
    editLines: null,
    startCooking: null,
    markReady: 'READY',
    cancel: 'CANCELLED',
  },
  READY: {
    editLines: null,
    startCooking: null,
    markReady: null,
    cancel: null,
  },
  CLOSED: {
    editLines: null,
    startCooking: null,
    markReady: null,
    cancel: null,
  },
  CANCELLED: {
    editLines: null,
    startCooking: null,
    markReady: null,
    cancel: null,
  },
};

describe('order status State', () => {
  it('allows editing lines while OPEN (S1)', () => {
    expect(orderStatus('OPEN').canEditLines).toBe(true);
  });

  it('rejects editing lines in IN_KITCHEN (S2)', () => {
    expect(orderStatus('IN_KITCHEN').canEditLines).toBe(false);
  });

  it('rejects editing lines in READY (S2)', () => {
    expect(orderStatus('READY').canEditLines).toBe(false);
  });

  it('rejects editing lines in CLOSED (S2)', () => {
    expect(orderStatus('CLOSED').canEditLines).toBe(false);
  });

  it('rejects editing lines in CANCELLED (S2)', () => {
    expect(orderStatus('CANCELLED').canEditLines).toBe(false);
  });

  it('moves OPEN to IN_KITCHEN on startCooking (S3)', () => {
    expect(orderStatus('OPEN').next('startCooking')).toBe('IN_KITCHEN');
  });

  it('moves IN_KITCHEN to READY on markReady (S4)', () => {
    expect(orderStatus('IN_KITCHEN').next('markReady')).toBe('READY');
  });

  it('moves OPEN to CANCELLED on cancel (S5)', () => {
    expect(orderStatus('OPEN').next('cancel')).toBe('CANCELLED');
  });

  it('moves IN_KITCHEN to CANCELLED on cancel (S5)', () => {
    expect(orderStatus('IN_KITCHEN').next('cancel')).toBe('CANCELLED');
  });

  it('rejects cancel from READY (S6)', () => {
    expect(() => orderStatus('READY').next('cancel')).toThrow(InvalidOrderTransitionError);
  });

  it('rejects every transition from CLOSED (S7)', () => {
    for (const action of ORDER_TRANSITION_ACTIONS) {
      expect(() => orderStatus('CLOSED').next(action)).toThrow(InvalidOrderTransitionError);
    }
  });

  it('rejects every transition from CANCELLED (S7)', () => {
    for (const action of ORDER_TRANSITION_ACTIONS) {
      expect(() => orderStatus('CANCELLED').next(action)).toThrow(InvalidOrderTransitionError);
    }
  });

  it('matches the full status × action transition table (S8)', () => {
    for (const status of ORDER_STATUSES) {
      for (const action of ORDER_TRANSITION_ACTIONS) {
        const expected = NEXT_TABLE[status][action];
        if (expected === null) {
          expect(() => orderStatus(status).next(action)).toThrow(InvalidOrderTransitionError);
        } else {
          expect(orderStatus(status).next(action)).toBe(expected);
        }
      }
    }
  });

  it('lists allowed actions for OPEN with and without lines', () => {
    expect(orderStatus('OPEN').allowedActions(0)).toEqual(['editLines', 'cancel']);
    expect(orderStatus('OPEN').allowedActions(1)).toEqual([
      'editLines',
      'startCooking',
      'cancel',
    ]);
  });

  it('lists allowed actions for IN_KITCHEN, READY, and CANCELLED', () => {
    expect(orderStatus('IN_KITCHEN').allowedActions(2)).toEqual(['markReady', 'cancel']);
    expect(orderStatus('READY').allowedActions(2)).toEqual([]);
    expect(orderStatus('CANCELLED').allowedActions(2)).toEqual([]);
  });
});

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
    sendToKitchen: 'SENT_TO_KITCHEN',
    beginCooking: null,
    markReady: null,
    cancel: 'CANCELLED',
  },
  SENT_TO_KITCHEN: {
    editLines: null,
    sendToKitchen: null,
    beginCooking: 'IN_KITCHEN',
    markReady: null,
    cancel: 'CANCELLED',
  },
  IN_KITCHEN: {
    editLines: null,
    sendToKitchen: null,
    beginCooking: null,
    markReady: 'READY',
    cancel: null,
  },
  READY: {
    editLines: null,
    sendToKitchen: null,
    beginCooking: null,
    markReady: null,
    cancel: null,
  },
  CLOSED: {
    editLines: null,
    sendToKitchen: null,
    beginCooking: null,
    markReady: null,
    cancel: null,
  },
  CANCELLED: {
    editLines: null,
    sendToKitchen: null,
    beginCooking: null,
    markReady: null,
    cancel: null,
  },
};

describe('order status State', () => {
  it('allows editing lines while OPEN (S1)', () => {
    expect(orderStatus('OPEN').canEditLines).toBe(true);
  });

  it('rejects editing lines after send and while cooking (S2)', () => {
    expect(orderStatus('SENT_TO_KITCHEN').canEditLines).toBe(false);
    expect(orderStatus('IN_KITCHEN').canEditLines).toBe(false);
    expect(orderStatus('READY').canEditLines).toBe(false);
    expect(orderStatus('CLOSED').canEditLines).toBe(false);
    expect(orderStatus('CANCELLED').canEditLines).toBe(false);
  });

  it('moves OPEN to SENT_TO_KITCHEN on sendToKitchen (S3)', () => {
    expect(orderStatus('OPEN').next('sendToKitchen')).toBe('SENT_TO_KITCHEN');
  });

  it('moves SENT_TO_KITCHEN to IN_KITCHEN on beginCooking (S3b)', () => {
    expect(orderStatus('SENT_TO_KITCHEN').next('beginCooking')).toBe('IN_KITCHEN');
  });

  it('moves IN_KITCHEN to READY on markReady (S4)', () => {
    expect(orderStatus('IN_KITCHEN').next('markReady')).toBe('READY');
  });

  it('rejects markReady before cooking has begun (S4b)', () => {
    expect(() => orderStatus('SENT_TO_KITCHEN').next('markReady')).toThrow(
      InvalidOrderTransitionError,
    );
  });

  it('moves OPEN and SENT_TO_KITCHEN to CANCELLED on cancel (S5)', () => {
    expect(orderStatus('OPEN').next('cancel')).toBe('CANCELLED');
    expect(orderStatus('SENT_TO_KITCHEN').next('cancel')).toBe('CANCELLED');
  });

  it('rejects cancel once cooking has begun (S5b)', () => {
    expect(() => orderStatus('IN_KITCHEN').next('cancel')).toThrow(InvalidOrderTransitionError);
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
      'sendToKitchen',
      'cancel',
    ]);
  });

  it('lists allowed actions for SENT_TO_KITCHEN, IN_KITCHEN, READY, and CANCELLED', () => {
    expect(orderStatus('SENT_TO_KITCHEN').allowedActions(2)).toEqual([
      'beginCooking',
      'cancel',
    ]);
    expect(orderStatus('IN_KITCHEN').allowedActions(2)).toEqual(['markReady']);
    expect(orderStatus('READY').allowedActions(2)).toEqual([]);
    expect(orderStatus('CANCELLED').allowedActions(2)).toEqual([]);
  });

  /**
   * Analysis §6 — when discount/tip may be adjusted (ST3).
   * Viewing totals is always allowed; that is not a State flag.
   */
  const CAN_ADJUST_TOTALS: Record<OrderStatus, boolean> = {
    OPEN: true,
    SENT_TO_KITCHEN: true,
    IN_KITCHEN: true,
    READY: true,
    CLOSED: false,
    CANCELLED: false,
  };

  it('allows adjusting totals while the order is alive (ST1)', () => {
    for (const status of ['OPEN', 'SENT_TO_KITCHEN', 'IN_KITCHEN', 'READY'] as const) {
      expect(orderStatus(status).canAdjustTotals).toBe(true);
    }
  });

  it('rejects adjusting totals when CLOSED or CANCELLED (ST2)', () => {
    expect(orderStatus('CLOSED').canAdjustTotals).toBe(false);
    expect(orderStatus('CANCELLED').canAdjustTotals).toBe(false);
  });

  it('matches the analysis §6 canAdjustTotals table for every status (ST3)', () => {
    for (const status of ORDER_STATUSES) {
      expect(orderStatus(status).canAdjustTotals).toBe(CAN_ADJUST_TOTALS[status]);
    }
  });
});


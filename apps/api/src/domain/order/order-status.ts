import { InvalidOrderTransitionError } from './order.errors';

export type OrderStatus =
  | 'OPEN'
  | 'SENT_TO_KITCHEN'
  | 'IN_KITCHEN'
  | 'READY'
  | 'CLOSED'
  | 'CANCELLED';

export type OrderAction =
  | 'editLines'
  | 'sendToKitchen'
  | 'beginCooking'
  | 'markReady'
  | 'cancel'
  | 'close';

/** Actions that `next` understands. `editLines` is never a transition. */
export type OrderTransitionAction = OrderAction;

type OrderStatusBehavior = {
  readonly name: OrderStatus;
  readonly canEditLines: boolean;
  readonly canAdjustTotals: boolean;
  readonly canClose: boolean;
  next(action: OrderTransitionAction): OrderStatus;
  allowedActions(lineCount: number): OrderAction[];
};

const openStatus: OrderStatusBehavior = {
  name: 'OPEN',
  canEditLines: true,
  canAdjustTotals: true,
  canClose: false,
  next(action) {
    if (action === 'sendToKitchen') {
      return 'SENT_TO_KITCHEN';
    }
    if (action === 'cancel') {
      return 'CANCELLED';
    }
    throw new InvalidOrderTransitionError();
  },
  allowedActions(lineCount) {
    if (lineCount > 0) {
      return ['editLines', 'sendToKitchen', 'cancel'];
    }
    return ['editLines', 'cancel'];
  },
};

/** Arrived at kitchen; waiter may still cancel; kitchen has not begun cooking. */
const sentToKitchenStatus: OrderStatusBehavior = {
  name: 'SENT_TO_KITCHEN',
  canEditLines: false,
  canAdjustTotals: true,
  canClose: false,
  next(action) {
    if (action === 'beginCooking') {
      return 'IN_KITCHEN';
    }
    if (action === 'cancel') {
      return 'CANCELLED';
    }
    throw new InvalidOrderTransitionError();
  },
  allowedActions() {
    return ['beginCooking', 'cancel'];
  },
};

/** Cooking in progress: not editable, not cancellable; kitchen may mark ready. */
const inKitchenStatus: OrderStatusBehavior = {
  name: 'IN_KITCHEN',
  canEditLines: false,
  canAdjustTotals: true,
  canClose: false,
  next(action) {
    if (action === 'markReady') {
      return 'READY';
    }
    throw new InvalidOrderTransitionError();
  },
  allowedActions() {
    return ['markReady'];
  },
};

const readyStatus: OrderStatusBehavior = {
  name: 'READY',
  canEditLines: false,
  canAdjustTotals: true,
  canClose: true,
  next(action) {
    if (action === 'close') {
      return 'CLOSED';
    }
    throw new InvalidOrderTransitionError();
  },
  allowedActions() {
    return ['close'];
  },
};

const closedStatus: OrderStatusBehavior = {
  name: 'CLOSED',
  canEditLines: false,
  canAdjustTotals: false,
  canClose: false,
  next() {
    throw new InvalidOrderTransitionError();
  },
  allowedActions() {
    return [];
  },
};

const cancelledStatus: OrderStatusBehavior = {
  name: 'CANCELLED',
  canEditLines: false,
  canAdjustTotals: false,
  canClose: false,
  next() {
    throw new InvalidOrderTransitionError();
  },
  allowedActions() {
    return [];
  },
};

const byName: Record<OrderStatus, OrderStatusBehavior> = {
  OPEN: openStatus,
  SENT_TO_KITCHEN: sentToKitchenStatus,
  IN_KITCHEN: inKitchenStatus,
  READY: readyStatus,
  CLOSED: closedStatus,
  CANCELLED: cancelledStatus,
};

const ALL_STATUSES: readonly OrderStatus[] = [
  'OPEN',
  'SENT_TO_KITCHEN',
  'IN_KITCHEN',
  'READY',
  'CLOSED',
  'CANCELLED',
];

/** Returns the State object for a known status name. */
export function orderStatus(name: OrderStatus): OrderStatusBehavior {
  return byName[name];
}

export function isOrderStatus(value: string): value is OrderStatus {
  return (ALL_STATUSES as readonly string[]).includes(value);
}

export const ORDER_STATUSES = ALL_STATUSES;

/** Statuses that still occupy a dining table (not CLOSED / CANCELLED). */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  'OPEN',
  'SENT_TO_KITCHEN',
  'IN_KITCHEN',
  'READY',
];

export const ORDER_TRANSITION_ACTIONS: readonly OrderTransitionAction[] = [
  'editLines',
  'sendToKitchen',
  'beginCooking',
  'markReady',
  'cancel',
  'close',
];

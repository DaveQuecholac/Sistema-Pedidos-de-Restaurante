import { InvalidOrderTransitionError } from './order.errors';

export type OrderStatus = 'OPEN' | 'IN_KITCHEN' | 'READY' | 'CLOSED' | 'CANCELLED';

export type OrderAction = 'editLines' | 'startCooking' | 'markReady' | 'cancel';

/** Actions that `next` understands. `editLines` is never a transition. */
export type OrderTransitionAction = OrderAction;

type OrderStatusBehavior = {
  readonly name: OrderStatus;
  readonly canEditLines: boolean;
  next(action: OrderTransitionAction): OrderStatus;
  allowedActions(lineCount: number): OrderAction[];
};

const openStatus: OrderStatusBehavior = {
  name: 'OPEN',
  canEditLines: true,
  next(action) {
    if (action === 'startCooking') {
      return 'IN_KITCHEN';
    }
    if (action === 'cancel') {
      return 'CANCELLED';
    }
    throw new InvalidOrderTransitionError();
  },
  allowedActions(lineCount) {
    if (lineCount > 0) {
      return ['editLines', 'startCooking', 'cancel'];
    }
    return ['editLines', 'cancel'];
  },
};

const inKitchenStatus: OrderStatusBehavior = {
  name: 'IN_KITCHEN',
  canEditLines: false,
  next(action) {
    if (action === 'markReady') {
      return 'READY';
    }
    if (action === 'cancel') {
      return 'CANCELLED';
    }
    throw new InvalidOrderTransitionError();
  },
  allowedActions() {
    return ['markReady', 'cancel'];
  },
};

const readyStatus: OrderStatusBehavior = {
  name: 'READY',
  canEditLines: false,
  next() {
    throw new InvalidOrderTransitionError();
  },
  allowedActions() {
    return [];
  },
};

const closedStatus: OrderStatusBehavior = {
  name: 'CLOSED',
  canEditLines: false,
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
  next() {
    throw new InvalidOrderTransitionError();
  },
  allowedActions() {
    return [];
  },
};

const byName: Record<OrderStatus, OrderStatusBehavior> = {
  OPEN: openStatus,
  IN_KITCHEN: inKitchenStatus,
  READY: readyStatus,
  CLOSED: closedStatus,
  CANCELLED: cancelledStatus,
};

const ALL_STATUSES: readonly OrderStatus[] = [
  'OPEN',
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

export const ORDER_TRANSITION_ACTIONS: readonly OrderTransitionAction[] = [
  'editLines',
  'startCooking',
  'markReady',
  'cancel',
];

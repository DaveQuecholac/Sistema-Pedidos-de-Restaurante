export { InvalidTableIdError } from '../table/table.errors';

export class InvalidExternalOrderIdError extends Error {
  constructor() {
    super('External order id must be 1 to 64 characters after trim');
    this.name = 'InvalidExternalOrderIdError';
  }
}

export class InvalidOrderOriginError extends Error {
  constructor() {
    super('Order origin must be exactly one of tableId or externalOrderId');
    this.name = 'InvalidOrderOriginError';
  }
}

export class InvalidQuantityError extends Error {
  constructor() {
    super('Quantity must be an integer from 1 to 99');
    this.name = 'InvalidQuantityError';
  }
}

export class MenuItemUnavailableError extends Error {
  constructor() {
    super('Menu item is not available for ordering');
    this.name = 'MenuItemUnavailableError';
  }
}

export class UnknownModifierError extends Error {
  constructor() {
    super('Selected modifier does not belong to the menu item');
    this.name = 'UnknownModifierError';
  }
}

export class DuplicateModifierSelectionError extends Error {
  constructor() {
    super('The same modifier cannot be selected twice');
    this.name = 'DuplicateModifierSelectionError';
  }
}

export class InvalidOrderTransitionError extends Error {
  constructor() {
    super('That order status transition is not allowed');
    this.name = 'InvalidOrderTransitionError';
  }
}

export class EmptyOrderError extends Error {
  constructor() {
    super('Cannot start cooking an order with no lines');
    this.name = 'EmptyOrderError';
  }
}

export class OrderNotEditableError extends Error {
  constructor() {
    super('Order lines cannot be edited in the current status');
    this.name = 'OrderNotEditableError';
  }
}

export class LineItemNotFoundError extends Error {
  constructor() {
    super('Line item was not found on the order');
    this.name = 'LineItemNotFoundError';
  }
}

export class DuplicateLineItemIdError extends Error {
  constructor() {
    super('Line item id must be unique on an order');
    this.name = 'DuplicateLineItemIdError';
  }
}

export class InvalidOrderStatusError extends Error {
  constructor() {
    super('Order status is not a known value');
    this.name = 'InvalidOrderStatusError';
  }
}

export class InvalidOrderVersionError extends Error {
  constructor() {
    super('Order version must be an integer greater than or equal to 0');
    this.name = 'InvalidOrderVersionError';
  }
}

export class OrderTotalsNotAdjustableError extends Error {
  constructor() {
    super('Order discount and tip cannot be adjusted in the current status');
    this.name = 'OrderTotalsNotAdjustableError';
  }
}

export class OrderNotClosableError extends Error {
  constructor() {
    super('Order can only be closed when READY');
    this.name = 'OrderNotClosableError';
  }
}

export class InvalidOrderPaymentError extends Error {
  constructor() {
    super('CLOSED orders require a matching payment and open orders must have none');
    this.name = 'InvalidOrderPaymentError';
  }
}

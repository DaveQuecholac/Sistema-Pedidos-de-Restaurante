import { BlankIdError } from '../menu/menu-item.errors';
import type { LineItem } from './line-item';
import type { OrderOrigin } from './order-origin';
import {
  DuplicateLineItemIdError,
  EmptyOrderError,
  InvalidOrderStatusError,
  InvalidOrderVersionError,
  LineItemNotFoundError,
  OrderNotEditableError,
} from './order.errors';
import {
  isOrderStatus,
  orderStatus,
  type OrderAction,
  type OrderStatus,
} from './order-status';

export type OrderRestoreInput = {
  id: string;
  origin: OrderOrigin;
  status: string;
  openedAt: Date;
  lines: readonly LineItem[];
  version: number;
};

/** Aggregate root: origin, lines, kitchen state. Does not change version. */
export class Order {
  private constructor(
    private readonly idValue: string,
    private readonly originValue: OrderOrigin,
    private readonly statusValue: OrderStatus,
    private readonly openedAtValue: Date,
    private readonly linesValue: readonly LineItem[],
    private readonly versionValue: number,
  ) {}

  static open(input: { id: string; origin: OrderOrigin; openedAt: Date }): Order {
    return new Order(requireId(input.id), input.origin, 'OPEN', input.openedAt, [], 0);
  }

  static restore(input: OrderRestoreInput): Order {
    if (!isOrderStatus(input.status)) {
      throw new InvalidOrderStatusError();
    }
    if (!Number.isInteger(input.version) || input.version < 0) {
      throw new InvalidOrderVersionError();
    }

    const lines = requireUniqueLines(input.lines);
    return new Order(
      requireId(input.id),
      input.origin,
      input.status,
      input.openedAt,
      lines,
      input.version,
    );
  }

  addLine(line: LineItem): Order {
    this.requireEditable();
    if (this.linesValue.some((existing) => existing.id === line.id)) {
      throw new DuplicateLineItemIdError();
    }

    return this.copy({ lines: [...this.linesValue, line] });
  }

  replaceLine(line: LineItem): Order {
    this.requireEditable();
    const index = this.linesValue.findIndex((existing) => existing.id === line.id);
    if (index < 0) {
      throw new LineItemNotFoundError();
    }

    const lines = [...this.linesValue];
    lines[index] = line;
    return this.copy({ lines });
  }

  cancelLine(lineId: string): Order {
    this.requireEditable();
    const index = this.linesValue.findIndex((existing) => existing.id === lineId);
    if (index < 0) {
      throw new LineItemNotFoundError();
    }

    return this.copy({
      lines: this.linesValue.filter((existing) => existing.id !== lineId),
    });
  }

  sendToKitchen(): Order {
    if (this.linesValue.length === 0) {
      throw new EmptyOrderError();
    }

    return this.copy({ status: orderStatus(this.statusValue).next('sendToKitchen') });
  }

  beginCooking(): Order {
    return this.copy({ status: orderStatus(this.statusValue).next('beginCooking') });
  }

  markReady(): Order {
    return this.copy({ status: orderStatus(this.statusValue).next('markReady') });
  }

  cancel(): Order {
    return this.copy({ status: orderStatus(this.statusValue).next('cancel') });
  }

  allowedActions(): OrderAction[] {
    return orderStatus(this.statusValue).allowedActions(this.linesValue.length);
  }

  get id(): string {
    return this.idValue;
  }

  get origin(): OrderOrigin {
    return this.originValue;
  }

  get status(): OrderStatus {
    return this.statusValue;
  }

  get openedAt(): Date {
    return this.openedAtValue;
  }

  get lines(): LineItem[] {
    return [...this.linesValue];
  }

  get version(): number {
    return this.versionValue;
  }

  private requireEditable(): void {
    if (!orderStatus(this.statusValue).canEditLines) {
      throw new OrderNotEditableError();
    }
  }

  private copy(patch: {
    status?: OrderStatus;
    lines?: readonly LineItem[];
  }): Order {
    return new Order(
      this.idValue,
      this.originValue,
      patch.status ?? this.statusValue,
      this.openedAtValue,
      patch.lines ?? this.linesValue,
      this.versionValue,
    );
  }
}

function requireId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    throw new BlankIdError();
  }
  return trimmed;
}

function requireUniqueLines(lines: readonly LineItem[]): LineItem[] {
  const copy = [...lines];
  const seen = new Set<string>();

  for (const line of copy) {
    if (seen.has(line.id)) {
      throw new DuplicateLineItemIdError();
    }
    seen.add(line.id);
  }

  return copy;
}

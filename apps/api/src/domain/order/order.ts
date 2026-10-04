import { BlankIdError } from '../menu/menu-item.errors';
import { Money } from '../money/money';
import type { Payment } from '../payment/payment';
import { PaymentAmountMismatchError } from '../payment/payment.errors';
import type { Discount } from '../totals/discount';
import { calculateTotals, type OrderTotals } from '../totals/order-totals';
import type { Tip } from '../totals/tip';
import type { LineItem } from './line-item';
import type { OrderOrigin } from './order-origin';
import {
  DuplicateLineItemIdError,
  EmptyOrderError,
  InvalidOrderPaymentError,
  InvalidOrderStatusError,
  InvalidOrderVersionError,
  LineItemNotFoundError,
  OrderNotClosableError,
  OrderNotEditableError,
  OrderTotalsNotAdjustableError,
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
  discount: Discount | null;
  tip: Tip | null;
  payment: Payment | null;
};

/** Aggregate root: origin, lines, kitchen state, totals adjustments and payment. Does not change version. */
export class Order {
  private constructor(
    private readonly idValue: string,
    private readonly originValue: OrderOrigin,
    private readonly statusValue: OrderStatus,
    private readonly openedAtValue: Date,
    private readonly linesValue: readonly LineItem[],
    private readonly versionValue: number,
    private readonly discountValue: Discount | null,
    private readonly tipValue: Tip | null,
    private readonly paymentValue: Payment | null,
  ) {}

  static open(input: { id: string; origin: OrderOrigin; openedAt: Date }): Order {
    return new Order(
      requireId(input.id),
      input.origin,
      'OPEN',
      input.openedAt,
      [],
      0,
      null,
      null,
      null,
    );
  }

  static restore(input: OrderRestoreInput): Order {
    if (!isOrderStatus(input.status)) {
      throw new InvalidOrderStatusError();
    }
    if (!Number.isInteger(input.version) || input.version < 0) {
      throw new InvalidOrderVersionError();
    }

    const lines = requireUniqueLines(input.lines);
    const order = new Order(
      requireId(input.id),
      input.origin,
      input.status,
      input.openedAt,
      lines,
      input.version,
      input.discount,
      input.tip,
      input.payment,
    );

    const isClosed = order.statusValue === 'CLOSED';
    const hasPayment = order.paymentValue !== null;
    if (isClosed !== hasPayment) {
      throw new InvalidOrderPaymentError();
    }
    if (
      order.paymentValue !== null &&
      !order.paymentValue.amount.equals(order.totals().total)
    ) {
      throw new InvalidOrderPaymentError();
    }

    return order;
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

  close(payment: Payment): Order {
    if (!this.canClose()) {
      throw new OrderNotClosableError();
    }
    if (!payment.amount.equals(this.totals().total)) {
      throw new PaymentAmountMismatchError();
    }

    return this.copy({
      status: orderStatus(this.statusValue).next('close'),
      payment,
    });
  }

  setDiscount(discount: Discount | null): Order {
    this.requireAdjustableTotals();
    return this.copy({ discount });
  }

  setTip(tip: Tip | null): Order {
    this.requireAdjustableTotals();
    return this.copy({ tip });
  }

  totals(): OrderTotals {
    return calculateTotals({
      lines: this.linesValue.map((line) => ({
        lineId: line.id,
        name: line.name,
        quantity: line.quantity.amount,
        unitPrice: line.unitPrice,
        extras: line.modifiers.map(
          (modifier) => modifier.price ?? Money.zero(line.unitPrice.currency),
        ),
        taxRate: line.applicableTax,
      })),
      discount: this.discountValue,
      tip: this.tipValue,
    });
  }

  canAdjustTotals(): boolean {
    return orderStatus(this.statusValue).canAdjustTotals;
  }

  canClose(): boolean {
    return orderStatus(this.statusValue).canClose;
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

  get discount(): Discount | null {
    return this.discountValue;
  }

  get tip(): Tip | null {
    return this.tipValue;
  }

  get payment(): Payment | null {
    return this.paymentValue;
  }

  private requireEditable(): void {
    if (!orderStatus(this.statusValue).canEditLines) {
      throw new OrderNotEditableError();
    }
  }

  private requireAdjustableTotals(): void {
    if (!this.canAdjustTotals()) {
      throw new OrderTotalsNotAdjustableError();
    }
  }

  private copy(patch: {
    status?: OrderStatus;
    lines?: readonly LineItem[];
    discount?: Discount | null;
    tip?: Tip | null;
    payment?: Payment | null;
  }): Order {
    return new Order(
      this.idValue,
      this.originValue,
      patch.status ?? this.statusValue,
      this.openedAtValue,
      patch.lines ?? this.linesValue,
      this.versionValue,
      patch.discount !== undefined ? patch.discount : this.discountValue,
      patch.tip !== undefined ? patch.tip : this.tipValue,
      patch.payment !== undefined ? patch.payment : this.paymentValue,
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

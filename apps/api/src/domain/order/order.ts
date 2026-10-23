import { BlankIdError } from '../menu/menu-item.errors';
import { Money } from '../money/money';
import type { Payment } from '../payment/payment';
import { PaymentAmountMismatchError } from '../payment/payment.errors';
import type { Discount } from '../totals/discount';
import { calculateTotals, type OrderTotals, type TotalsLine } from '../totals/order-totals';
import type { Tip } from '../totals/tip';
import type { LineItem } from './line-item';
import type { OrderOrigin } from './order-origin';
import {
  DuplicateLineItemIdError,
  EmptyOrderError,
  InvalidOrderOriginError,
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
  sittingId?: string | null;
  tableSettlementId?: string | null;
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
    private readonly sittingIdValue: string | null,
    private readonly tableSettlementIdValue: string | null,
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
      optionalId(input.sittingId),
      optionalId(input.tableSettlementId),
    );

    const settledOnTable = order.tableSettlementIdValue !== null;
    if (order.statusValue === 'CLOSED') {
      if (settledOnTable) {
        if (order.paymentValue !== null) {
          throw new InvalidOrderPaymentError();
        }
      } else if (
        order.paymentValue === null ||
        !order.paymentValue.amount.equals(order.totals().total)
      ) {
        throw new InvalidOrderPaymentError();
      }
    } else if (order.paymentValue !== null || settledOnTable) {
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

  /** Closes a ready comanda as part of the table's single bill. The payment lives on that bill. */
  closeOnTableAccount(settlementId: string): Order {
    if (this.sittingIdValue !== settlementId || !this.canClose()) {
      throw new OrderNotClosableError();
    }

    return this.copy({
      status: orderStatus(this.statusValue).next('close'),
      payment: null,
      tableSettlementId: settlementId,
    });
  }

  bindSitting(sittingId: string): Order {
    const trimmed = sittingId.trim();
    if (trimmed.length === 0) {
      throw new BlankIdError();
    }
    if (this.originValue.tableId === null) {
      throw new InvalidOrderOriginError();
    }
    if (this.sittingIdValue !== null) {
      return this;
    }
    return this.copy({ sittingId: trimmed });
  }

  lineContributions(): TotalsLine[] {
    return this.linesValue.map((line) => ({
      lineId: line.id,
      name: line.name,
      quantity: line.quantity.amount,
      unitPrice: line.unitPrice,
      extras: line.modifiers.map(
        (modifier) => modifier.price ?? Money.zero(line.unitPrice.currency),
      ),
      taxRate: line.applicableTax,
    }));
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
      lines: this.lineContributions(),
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

  get sittingId(): string | null {
    return this.sittingIdValue;
  }

  get tableSettlementId(): string | null {
    return this.tableSettlementIdValue;
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
    sittingId?: string | null;
    tableSettlementId?: string | null;
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
      patch.sittingId !== undefined ? patch.sittingId : this.sittingIdValue,
      patch.tableSettlementId !== undefined
        ? patch.tableSettlementId
        : this.tableSettlementIdValue,
    );
  }
}

function optionalId(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BlankIdError();
  }
  return trimmed;
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

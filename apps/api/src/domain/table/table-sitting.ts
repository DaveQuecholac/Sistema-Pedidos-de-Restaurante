import type { Discount } from '../totals/discount';
import type { Tip } from '../totals/tip';
import type { Payment } from '../payment/payment';
import { BlankIdError } from '../menu/menu-item.errors';
import { InvalidOrderPaymentError } from '../order/order.errors';

export type BillingMode = 'combined' | 'separate';

export class TableSittingClosedError extends Error {
  constructor() {
    super('Table sitting is already closed');
    this.name = 'TableSittingClosedError';
  }
}

export class TableAccountNotReadyError extends Error {
  constructor() {
    super('Every comanda on the table must be ready before the single bill can close');
    this.name = 'TableAccountNotReadyError';
  }
}

export class TableAccountEmptyError extends Error {
  constructor() {
    super('The table has no comandas to bill');
    this.name = 'TableAccountEmptyError';
  }
}

export class NoOpenTableSittingError extends Error {
  constructor() {
    super('The table has no open sitting');
    this.name = 'NoOpenTableSittingError';
  }
}

type SittingData = {
  id: string;
  tableId: string;
  billingMode: BillingMode;
  discount: Discount | null;
  tip: Tip | null;
  payment: Payment | null;
  status: 'OPEN' | 'CLOSED';
};

/** The open bill of a table. Several comandas share it. Default billing is one combined account. */
export class TableSitting {
  private constructor(
    private readonly idValue: string,
    private readonly tableIdValue: string,
    private readonly statusValue: 'OPEN' | 'CLOSED',
    private readonly billingModeValue: BillingMode,
    private readonly discountValue: Discount | null,
    private readonly tipValue: Tip | null,
    private readonly paymentValue: Payment | null,
  ) {}

  static open(input: { id: string; tableId: string }): TableSitting {
    return new TableSitting(requireId(input.id), requireId(input.tableId), 'OPEN', 'combined', null, null, null);
  }

  static restore(input: SittingData): TableSitting {
    const sitting = new TableSitting(
      requireId(input.id),
      requireId(input.tableId),
      input.status,
      input.billingMode,
      input.discount,
      input.tip,
      input.payment,
    );
    if (sitting.statusValue === 'OPEN' && sitting.paymentValue !== null) {
      throw new InvalidOrderPaymentError();
    }
    if (sitting.statusValue === 'CLOSED' && sitting.billingModeValue === 'separate' && sitting.paymentValue !== null) {
      throw new InvalidOrderPaymentError();
    }
    return sitting;
  }

  setBillingMode(mode: BillingMode): TableSitting {
    this.requireOpen();
    return this.copy({ billingMode: mode });
  }

  setDiscount(discount: Discount | null): TableSitting {
    this.requireOpen();
    return this.copy({ discount });
  }

  setTip(tip: Tip | null): TableSitting {
    this.requireOpen();
    return this.copy({ tip });
  }

  closeWithPayment(payment: Payment): TableSitting {
    this.requireOpen();
    return this.copy({ status: 'CLOSED', payment });
  }

  closeIdle(): TableSitting {
    this.requireOpen();
    return this.copy({ status: 'CLOSED', payment: null });
  }

  get id(): string {
    return this.idValue;
  }

  get tableId(): string {
    return this.tableIdValue;
  }

  get status(): 'OPEN' | 'CLOSED' {
    return this.statusValue;
  }

  get billingMode(): BillingMode {
    return this.billingModeValue;
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

  private requireOpen(): void {
    if (this.statusValue !== 'OPEN') {
      throw new TableSittingClosedError();
    }
  }

  private copy(patch: {
    status?: 'OPEN' | 'CLOSED';
    billingMode?: BillingMode;
    discount?: Discount | null;
    tip?: Tip | null;
    payment?: Payment | null;
  }): TableSitting {
    return new TableSitting(
      this.idValue,
      this.tableIdValue,
      patch.status ?? this.statusValue,
      patch.billingMode ?? this.billingModeValue,
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

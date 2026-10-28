import type { InferSelectModel } from 'drizzle-orm';
import { OrderMappingError } from '../../../application/order/order-repository.errors';
import type { PaymentReceiptQuery } from '../../../application/ports/payment-receipt-query';
import {
  BlankIdError,
  BlankNameError,
  ExclusionHasPriceError,
  ExtraMissingPriceError,
  InvalidModifierKindError,
} from '../../../domain/menu/menu-item.errors';
import { InvalidTaxRateError, TaxRate } from '../../../domain/menu/tax-rate';
import { InvalidMoneyError, Money } from '../../../domain/money/money';
import { LineItem, type LineModifierRestoreInput } from '../../../domain/order/line-item';
import { Order } from '../../../domain/order/order';
import {
  DuplicateLineItemIdError,
  InvalidExternalOrderIdError,
  InvalidOrderPaymentError,
  InvalidOrderStatusError,
  InvalidOrderVersionError,
  InvalidQuantityError,
  InvalidTableIdError,
} from '../../../domain/order/order.errors';
import { OrderOrigin } from '../../../domain/order/order-origin';
import { Quantity } from '../../../domain/order/quantity';
import type { Payment } from '../../../domain/payment/payment';
import {
  InsufficientCashError,
  InvalidCardLast4Error,
  InvalidPayerReferenceError,
  InvalidPaymentMethodError,
  InvalidPaymentReferenceError,
} from '../../../domain/payment/payment.errors';
import { Discount } from '../../../domain/totals/discount';
import { Percentage } from '../../../domain/totals/percentage';
import { Tip } from '../../../domain/totals/tip';
import {
  InvalidDiscountError,
  InvalidPercentageError,
  InvalidTipError,
} from '../../../domain/totals/totals.errors';
import { orderLineModifiers, orderLines, orders } from './schema/order';

export type OrderRow = InferSelectModel<typeof orders>;
export type OrderLineRow = InferSelectModel<typeof orderLines>;
export type OrderLineModifierRow = InferSelectModel<typeof orderLineModifiers>;
const PERCENTAGE_PROBE = Money.of(10_000, 'MXN');
const FIXED_PROBE = Money.of(2_147_483_647, 'MXN');

export function toOrder(
  order: OrderRow,
  lines: readonly OrderLineRow[],
  modifiers: readonly OrderLineModifierRow[],
  payment: Payment | null,
): Order {
  try {
    const modifiersByLine = groupModifiers(modifiers);

    return Order.restore({
      id: order.id,
      origin: toOrigin(order),
      status: order.status,
      openedAt: order.openedAt,
      version: order.version,
      lines: lines.map((line) => {
        const stored = modifiersByLine.get(line.id);
        return toLine(line, stored === undefined ? [] : stored);
      }),
      discount: toDiscount(order),
      tip: toTip(order),
      payment,
      sittingId: order.sittingId,
      tableSettlementId: order.tableSettlementId,
    });
  } catch (error) {
    if (isOrderRuleError(error)) {
      throw new OrderMappingError();
    }
    throw error;
  }
}

export function readPaymentPointer(
  paymentId: string | null,
  paymentReference: string | null,
): { id: string; reference: string } | null {
  const idBlank = paymentId === null || paymentId.trim() === '';
  const referenceBlank = paymentReference === null || paymentReference.trim() === '';
  if (idBlank && referenceBlank) {
    return null;
  }
  if (idBlank || referenceBlank || paymentId === null || paymentReference === null) {
    throw new OrderMappingError();
  }
  return { id: paymentId, reference: paymentReference };
}

/** The columns say a payment exists. The body comes from the receipt. */
export async function recordedPayment(
  receipts: PaymentReceiptQuery,
  subjectId: string,
  paymentId: string | null,
  paymentReference: string | null,
): Promise<Payment | null> {
  const pointer = readPaymentPointer(paymentId, paymentReference);
  if (pointer === null) {
    return null;
  }

  let receipt: Payment | null;
  try {
    receipt = await receipts.findBySubjectId(subjectId);
  } catch (error) {
    if (isOrderRuleError(error)) {
      throw new OrderMappingError();
    }
    throw error;
  }

  if (receipt === null || receipt.reference !== pointer.reference) {
    throw new OrderMappingError();
  }
  return receipt;
}

/** Prefer the receipt id when Pagos already stored this charge. Otherwise keep the id on the order. */
export async function paymentColumnsForSave(
  receipts: PaymentReceiptQuery,
  subjectId: string,
  payment: Payment | null,
): Promise<{ paymentId: string | null; paymentReference: string | null }> {
  if (payment === null) {
    return { paymentId: null, paymentReference: null };
  }

  let receipt: Payment | null;
  try {
    receipt = await receipts.findBySubjectId(subjectId);
  } catch (error) {
    if (isOrderRuleError(error)) {
      throw new OrderMappingError();
    }
    throw error;
  }

  if (receipt !== null && receipt.reference === payment.reference) {
    return { paymentId: receipt.id, paymentReference: receipt.reference };
  }
  return { paymentId: payment.id, paymentReference: payment.reference };
}

export function toOrderRow(order: Order): OrderRow {
  return {
    id: order.id,
    tableId: order.origin.tableId,
    externalOrderId: order.origin.externalOrderId,
    status: order.status,
    openedAt: order.openedAt,
    version: order.version,
    ...toDiscountColumns(order.discount),
    ...toTipColumns(order.tip),
    sittingId: order.sittingId,
    tableSettlementId: order.tableSettlementId,
    paymentId: order.payment === null ? null : order.payment.id,
    paymentReference: order.payment === null ? null : order.payment.reference,
  };
}

export function toDiscountColumns(discount: Discount | null): Pick<
  OrderRow,
  'discountKind' | 'discountBasisPoints' | 'discountAmount' | 'discountCurrency'
> {
  if (discount === null) {
    return {
      discountKind: null,
      discountBasisPoints: null,
      discountAmount: null,
      discountCurrency: null,
    };
  }

  if (discount.kind === 'percentage') {
    return {
      discountKind: 'percentage',
      discountBasisPoints: discount.amountFor(PERCENTAGE_PROBE).amount,
      discountAmount: null,
      discountCurrency: null,
    };
  }

  const amount = discount.amountFor(FIXED_PROBE);
  return {
    discountKind: 'fixedAmount',
    discountBasisPoints: null,
    discountAmount: amount.amount,
    discountCurrency: amount.currency,
  };
}

export function toTipColumns(tip: Tip | null): Pick<
  OrderRow,
  'tipKind' | 'tipBasisPoints' | 'tipAmount' | 'tipCurrency'
> {
  if (tip === null) {
    return {
      tipKind: null,
      tipBasisPoints: null,
      tipAmount: null,
      tipCurrency: null,
    };
  }

  if (tip.kind === 'percentage') {
    return {
      tipKind: 'percentage',
      tipBasisPoints: tip.amountFor(PERCENTAGE_PROBE).amount,
      tipAmount: null,
      tipCurrency: null,
    };
  }

  const amount = tip.amountFor(FIXED_PROBE);
  return {
    tipKind: 'fixedAmount',
    tipBasisPoints: null,
    tipAmount: amount.amount,
    tipCurrency: amount.currency,
  };
}

export function toDiscount(order: {
  discountKind: string | null;
  discountBasisPoints: number | null;
  discountAmount: number | null;
  discountCurrency: string | null;
}): Discount | null {
  if (order.discountKind === null) {
    if (
      order.discountBasisPoints !== null ||
      order.discountAmount !== null ||
      order.discountCurrency !== null
    ) {
      throw new OrderMappingError();
    }
    return null;
  }

  if (order.discountKind === 'percentage') {
    if (
      order.discountBasisPoints === null ||
      order.discountAmount !== null ||
      order.discountCurrency !== null
    ) {
      throw new OrderMappingError();
    }
    return Discount.percentage(Percentage.of(order.discountBasisPoints));
  }

  if (order.discountKind === 'fixedAmount') {
    if (
      order.discountAmount === null ||
      order.discountCurrency === null ||
      order.discountBasisPoints !== null
    ) {
      throw new OrderMappingError();
    }
    return Discount.fixedAmount(Money.of(order.discountAmount, order.discountCurrency));
  }

  throw new OrderMappingError();
}

export function toTip(order: {
  tipKind: string | null;
  tipBasisPoints: number | null;
  tipAmount: number | null;
  tipCurrency: string | null;
}): Tip | null {
  if (order.tipKind === null) {
    if (
      order.tipBasisPoints !== null ||
      order.tipAmount !== null ||
      order.tipCurrency !== null
    ) {
      throw new OrderMappingError();
    }
    return null;
  }

  if (order.tipKind === 'percentage') {
    if (
      order.tipBasisPoints === null ||
      order.tipAmount !== null ||
      order.tipCurrency !== null
    ) {
      throw new OrderMappingError();
    }
    return Tip.percentage(Percentage.of(order.tipBasisPoints));
  }

  if (order.tipKind === 'fixedAmount') {
    if (
      order.tipAmount === null ||
      order.tipCurrency === null ||
      order.tipBasisPoints !== null
    ) {
      throw new OrderMappingError();
    }
    return Tip.fixedAmount(Money.of(order.tipAmount, order.tipCurrency));
  }

  throw new OrderMappingError();
}

function toOrigin(order: OrderRow): OrderOrigin {
  if (order.tableId !== null && order.externalOrderId === null) {
    return OrderOrigin.table(order.tableId);
  }

  if (order.tableId === null && order.externalOrderId !== null) {
    return OrderOrigin.external(order.externalOrderId);
  }

  throw new OrderMappingError();
}

function toLine(line: OrderLineRow, modifiers: readonly OrderLineModifierRow[]): LineItem {
  return LineItem.restore({
    id: line.id,
    menuItemId: line.menuItemId,
    name: line.name,
    unitPrice: Money.of(line.unitPriceAmount, line.unitPriceCurrency),
    applicableTax: TaxRate.of(line.taxBasisPoints),
    quantity: Quantity.of(line.quantity),
    modifiers: modifiers.map(toModifier),
  });
}

function toModifier(row: OrderLineModifierRow): LineModifierRestoreInput {
  return {
    modifierId: row.modifierId,
    name: row.name,
    kind: row.kind,
    price: storedPrice(row.priceAmount, row.priceCurrency),
  };
}

function storedPrice(amount: number | null, currency: string | null): Money | null {
  if (amount === null && currency === null) {
    return null;
  }

  if (amount === null || currency === null) {
    throw new OrderMappingError();
  }

  return Money.of(amount, currency);
}

function groupModifiers(rows: readonly OrderLineModifierRow[]): Map<string, OrderLineModifierRow[]> {
  const grouped = new Map<string, OrderLineModifierRow[]>();

  for (const row of rows) {
    const current = grouped.get(row.orderLineId);
    if (current === undefined) {
      grouped.set(row.orderLineId, [row]);
    } else {
      current.push(row);
    }
  }

  return grouped;
}

function isOrderRuleError(error: unknown): boolean {
  return (
    error instanceof OrderMappingError ||
    error instanceof InvalidMoneyError ||
    error instanceof InvalidTaxRateError ||
    error instanceof InvalidQuantityError ||
    error instanceof InvalidOrderStatusError ||
    error instanceof InvalidOrderVersionError ||
    error instanceof InvalidOrderPaymentError ||
    error instanceof InvalidTableIdError ||
    error instanceof InvalidExternalOrderIdError ||
    error instanceof ExtraMissingPriceError ||
    error instanceof ExclusionHasPriceError ||
    error instanceof InvalidModifierKindError ||
    error instanceof DuplicateLineItemIdError ||
    error instanceof BlankNameError ||
    error instanceof BlankIdError ||
    error instanceof InvalidPercentageError ||
    error instanceof InvalidDiscountError ||
    error instanceof InvalidTipError ||
    error instanceof InvalidPaymentMethodError ||
    error instanceof InvalidCardLast4Error ||
    error instanceof InvalidPayerReferenceError ||
    error instanceof InsufficientCashError ||
    error instanceof InvalidPaymentReferenceError
  );
}

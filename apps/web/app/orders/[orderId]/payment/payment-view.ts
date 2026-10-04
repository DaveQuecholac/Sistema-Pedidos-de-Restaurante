import {
  InvalidMenuAmountError,
  centavosToLabel,
  pesosToCentavos,
} from '../../../menu/menu-amount';
import { OrderApiError, type OrderJson, type OrderMoneyJson } from '../../order-api';
import { can } from '../../order-view';
import { totalsErrorText } from '../totals/totals-view';
import type { OrderTotalsJson } from '../totals/totals-api';
import type { PaymentBody, PaymentJson, PaymentMethodJson } from './payment-api';

export type PaymentStatus =
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown }
  | { kind: 'missing' }
  | {
      kind: 'ready';
      order: OrderJson;
      totals: OrderTotalsJson;
      payment: PaymentJson | null;
    };

export type PaymentViewKind =
  | 'loading'
  | 'error'
  | 'missing'
  | 'cancelled'
  | 'notReady'
  | 'payable'
  | 'closed';

export type ParsePaymentResult =
  | { ok: true; value: PaymentBody['payment'] }
  | { ok: false; message: string };

export type ReceiptRow = {
  label: string;
  value: string;
};

export const PAYMENT_METHODS: ReadonlyArray<{
  method: PaymentMethodJson;
  label: string;
}> = [
  { method: 'cash', label: 'Efectivo' },
  { method: 'card', label: 'Tarjeta' },
  { method: 'digitalGateway', label: 'Pasarela digital' },
];

const PAYMENT_ERROR_TEXTS: Record<string, string> = {
  PaymentDeclinedError: 'El cobro fue rechazado. Prueba con otra tarjeta o con otro medio.',
  PaymentProcessorUnavailableError:
    'El procesador de pagos no respondió. No se cobró nada; intenta de nuevo.',
  PaymentMethodUnavailableError: 'Ese medio de pago no está disponible.',
  PaymentAmountMismatchError: 'La cuenta cambió mientras cobrabas. Revisa el total nuevo.',
  OrderNotClosableError: 'Esta orden no se puede cobrar en su estado actual.',
  InsufficientCashError: 'El monto recibido no alcanza para el total.',
  InvalidCardLast4Error: 'Escribe los últimos 4 dígitos de la tarjeta.',
  InvalidPayerReferenceError:
    'Escribe el correo o teléfono del cliente (3 a 64 caracteres).',
  InvalidPaymentMethodError: 'Elige un medio de pago.',
  PaymentVoidFailedError: 'Hubo un cargo que no se pudo anular. Avisa al encargado.',
};

const LOCAL_CASH_ERROR = 'Escribe el monto recibido (hasta dos decimales).';
const LOCAL_CARD_ERROR = 'Escribe los últimos 4 dígitos de la tarjeta.';
const LOCAL_GATEWAY_ERROR =
  'Escribe el correo o teléfono del cliente (3 a 64 caracteres).';

const CARD_LAST4 = /^\d{4}$/;

export function methodLabel(method: PaymentMethodJson): string {
  const entry = PAYMENT_METHODS.find((item) => item.method === method);
  return entry?.label ?? method;
}

export function parsePaymentInput(
  method: PaymentMethodJson,
  text: string,
): ParsePaymentResult {
  if (method === 'cash') {
    try {
      return { ok: true, value: { method: 'cash', tendered: pesosToCentavos(text) } };
    } catch (error) {
      if (error instanceof InvalidMenuAmountError) {
        return { ok: false, message: LOCAL_CASH_ERROR };
      }
      throw error;
    }
  }

  if (method === 'card') {
    const cardLast4 = text.trim();
    if (!CARD_LAST4.test(cardLast4)) {
      return { ok: false, message: LOCAL_CARD_ERROR };
    }
    return { ok: true, value: { method: 'card', cardLast4 } };
  }

  const payerReference = text.trim();
  if (payerReference.length < 3 || payerReference.length > 64) {
    return { ok: false, message: LOCAL_GATEWAY_ERROR };
  }
  return { ok: true, value: { method: 'digitalGateway', payerReference } };
}

export function confirmationText(
  method: PaymentMethodJson,
  total: OrderMoneyJson,
  input: PaymentBody['payment'],
): string {
  const head = `Cobrar ${centavosToLabel(total.amount)} con ${methodLabel(method)}`;
  if (input.method === 'cash') {
    return `${head} · Recibido ${centavosToLabel(input.tendered)}`;
  }
  if (input.method === 'card') {
    return `${head} •••• ${input.cardLast4}`;
  }
  return `${head} · ${input.payerReference}`;
}

export function receiptRows(payment: PaymentJson): ReceiptRow[] {
  const rows: ReceiptRow[] = [
    { label: 'Medio', value: methodLabel(payment.method) },
    { label: 'Total', value: centavosToLabel(payment.amount.amount) },
  ];

  if (payment.method === 'cash' && payment.tendered !== null) {
    rows.push({ label: 'Recibido', value: centavosToLabel(payment.tendered.amount) });
  }
  if (payment.method === 'cash' && payment.change !== null) {
    rows.push({ label: 'Cambio', value: centavosToLabel(payment.change.amount) });
  }
  if (payment.method === 'card' && payment.cardLast4 !== null) {
    rows.push({ label: 'Tarjeta', value: `Tarjeta •••• ${payment.cardLast4}` });
  }
  if (payment.method === 'digitalGateway' && payment.payerReference !== null) {
    rows.push({ label: 'Cliente', value: payment.payerReference });
  }

  rows.push({ label: 'Referencia', value: payment.reference });
  rows.push({ label: 'Hora', value: payment.paidAt });
  return rows;
}

export function paymentErrorText(error: unknown): string {
  if (error instanceof OrderApiError && error.code !== null) {
    const known = PAYMENT_ERROR_TEXTS[error.code];
    if (known !== undefined) {
      return known;
    }
  }

  return totalsErrorText(error);
}

export function paymentView(state: PaymentStatus): PaymentViewKind {
  if (state.kind === 'loading' || state.kind === 'error' || state.kind === 'missing') {
    return state.kind;
  }

  if (state.order.status === 'CLOSED') {
    return 'closed';
  }
  if (state.order.status === 'CANCELLED') {
    return 'cancelled';
  }
  if (can(state.order, 'close')) {
    return 'payable';
  }
  return 'notReady';
}

import { OrderApiError, request, type OrderMoneyJson, type OrderStatusJson } from '../../ordenes/order-api';
import type { AdjustmentBody, OrderTotalsJson } from '../../ordenes/[orderId]/cuenta/totals-api';
import type { PaymentBody, PaymentJson } from '../../ordenes/[orderId]/cobro/payment-api';

export type TableAccountOrderJson = {
  id: string;
  status: OrderStatusJson;
  openedAt: string;
  lines: { name: string; quantity: number }[];
};

export type TableAccountJson = {
  tableId: string;
  billingMode: 'combined' | 'separate';
  canClose: boolean;
  adjustable: boolean;
  orders: TableAccountOrderJson[];
  totals: OrderTotalsJson | null;
};

export function getTableAccount(tableId: string): Promise<TableAccountJson> {
  return request(
    `/tables/${encodeURIComponent(tableId)}/account`,
    'GET',
    undefined,
    asAccount,
  );
}

export function setTableBillingMode(
  tableId: string,
  billingMode: 'combined' | 'separate',
): Promise<TableAccountJson> {
  return request(
    `/tables/${encodeURIComponent(tableId)}/account/billing-mode`,
    'PUT',
    { billingMode },
    asAccount,
  );
}

export function setTableTip(tableId: string, tip: AdjustmentBody | null): Promise<TableAccountJson> {
  return request(`/tables/${encodeURIComponent(tableId)}/account/tip`, 'PUT', { tip }, asAccount);
}

export type ClosedTableAccountJson = {
  tableId: string;
  orderIds: string[];
  payment: PaymentJson;
};

export function closeTableAccount(tableId: string, body: PaymentBody): Promise<ClosedTableAccountJson> {
  return request(
    `/tables/${encodeURIComponent(tableId)}/account/close`,
    'POST',
    body,
    (value) => value as ClosedTableAccountJson,
  );
}

export function tableBillKey(tableId: string, orderIds: readonly string[]): string {
  return `mesa:${tableId}:${[...orderIds].sort().join(',')}`;
}

export function tableAccountPath(tableId: string): string {
  return `/pago/mesa/${encodeURIComponent(tableId)}`;
}

export function tableCobroPath(tableId: string): string {
  return `/pago/mesa/${encodeURIComponent(tableId)}/cobro`;
}

function asAccount(value: unknown, status: number): TableAccountJson {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OrderApiError(status, 'La respuesta no es la cuenta de la mesa.', null);
  }
  return value as TableAccountJson;
}

export type { OrderMoneyJson };

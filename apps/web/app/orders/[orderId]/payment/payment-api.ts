import {
  OrderApiError,
  request,
  type OrderMoneyJson,
  type OrderStatusJson,
} from '../../order-api';

export type PaymentMethodJson = 'cash' | 'card' | 'digitalGateway';

export type PaymentJson = {
  id: string;
  method: PaymentMethodJson;
  amount: OrderMoneyJson;
  tendered: OrderMoneyJson | null;
  change: OrderMoneyJson | null;
  cardLast4: string | null;
  payerReference: string | null;
  reference: string;
  paidAt: string;
};

export type ClosedOrderJson = {
  orderId: string;
  status: OrderStatusJson;
  payment: PaymentJson;
};

export type PaymentBody = {
  expectedTotal: number;
  payment:
    | { method: 'cash'; tendered: number }
    | { method: 'card'; cardLast4: string }
    | { method: 'digitalGateway'; payerReference: string };
};

export function closeOrder(orderId: string, body: PaymentBody): Promise<ClosedOrderJson> {
  return request(
    `/orders/${encodeURIComponent(orderId)}/close`,
    'POST',
    body,
    asClosedOrder,
  );
}

export function getOrderPayment(orderId: string): Promise<ClosedOrderJson> {
  return request(
    `/orders/${encodeURIComponent(orderId)}/payment`,
    'GET',
    undefined,
    asClosedOrder,
  );
}

function asClosedOrder(value: unknown, status: number): ClosedOrderJson {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OrderApiError(status, 'La respuesta no es un cobro.', null);
  }

  return value as ClosedOrderJson;
}

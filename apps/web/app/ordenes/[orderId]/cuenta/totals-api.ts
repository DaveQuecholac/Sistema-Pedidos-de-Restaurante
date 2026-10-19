import {
  OrderApiError,
  request,
  type OrderMoneyJson,
} from '../../order-api';

export type AdjustmentBody =
  | { kind: 'percentage'; basisPoints: number }
  | { kind: 'fixedAmount'; amount: number };

export type OrderTotalsLineJson = {
  lineId: string;
  name: string;
  quantity: number;
  unitAmount: OrderMoneyJson;
  lineSubtotal: OrderMoneyJson;
  applicableTax: {
    basisPoints: number;
  };
};

export type OrderTotalsDiscountJson =
  | {
      kind: 'percentage';
      basisPoints: number;
      amount: OrderMoneyJson;
    }
  | {
      kind: 'fixedAmount';
      requested: OrderMoneyJson;
      amount: OrderMoneyJson;
    };

export type OrderTotalsTipJson =
  | {
      kind: 'percentage';
      basisPoints: number;
      amount: OrderMoneyJson;
    }
  | {
      kind: 'fixedAmount';
      amount: OrderMoneyJson;
    };

export type OrderTotalsTaxJson = {
  basisPoints: number;
  taxableBase: OrderMoneyJson;
  amount: OrderMoneyJson;
};

export type OrderTotalsJson = {
  orderId: string;
  currency: string;
  adjustable: boolean;
  lines: OrderTotalsLineJson[];
  subtotal: OrderMoneyJson;
  discount: OrderTotalsDiscountJson | null;
  taxes: OrderTotalsTaxJson[];
  taxTotal: OrderMoneyJson;
  tip: OrderTotalsTipJson | null;
  total: OrderMoneyJson;
};

export function getOrderTotals(orderId: string): Promise<OrderTotalsJson> {
  return request(
    `/orders/${encodeURIComponent(orderId)}/totals`,
    'GET',
    undefined,
    asOrderTotals,
  );
}

export function setOrderDiscount(
  orderId: string,
  discount: AdjustmentBody | null,
): Promise<OrderTotalsJson> {
  return request(
    `/orders/${encodeURIComponent(orderId)}/discount`,
    'PUT',
    { discount },
    asOrderTotals,
  );
}

export function setOrderTip(
  orderId: string,
  tip: AdjustmentBody | null,
): Promise<OrderTotalsJson> {
  return request(
    `/orders/${encodeURIComponent(orderId)}/tip`,
    'PUT',
    { tip },
    asOrderTotals,
  );
}

function asOrderTotals(value: unknown, status: number): OrderTotalsJson {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OrderApiError(status, 'La respuesta no es un desglose de cuenta.', null);
  }

  return value as OrderTotalsJson;
}

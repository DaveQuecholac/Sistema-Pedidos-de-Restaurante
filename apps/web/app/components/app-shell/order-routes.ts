/** Product navigation for an order. Detail stays in Órdenes; cuenta/cobro live under Pago. */
export function orderDetailPath(orderId: string): string {
  return `/ordenes/${encodeURIComponent(orderId)}`;
}

export function orderCuentaPath(orderId: string): string {
  return `/pago/${encodeURIComponent(orderId)}/cuenta`;
}

export function orderCobroPath(orderId: string): string {
  return `/pago/${encodeURIComponent(orderId)}/cobro`;
}

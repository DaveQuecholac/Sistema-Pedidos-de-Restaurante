/** Extracts order id from `/ordenes/:id…` or `/pago/:id…`. */
export function orderIdFromPath(pathname: string): string | null {
  const match = /^\/(?:ordenes|pago)\/([^/]+)/.exec(pathname);
  if (match === null) {
    return null;
  }

  const segment = match[1];
  if (segment === undefined || segment === '') {
    return null;
  }

  // "/pago" alone has no id; "/pago/:id/cuenta" does.
  if (segment === 'cuenta' || segment === 'cobro') {
    return null;
  }

  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function shortOrderLabel(orderId: string): string {
  if (orderId.length <= 8) {
    return orderId.toUpperCase();
  }
  return orderId.slice(0, 8).toUpperCase();
}

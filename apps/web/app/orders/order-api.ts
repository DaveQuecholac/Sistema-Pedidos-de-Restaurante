export class OrderApiConfigError extends Error {
  constructor() {
    super('Falta NEXT_PUBLIC_API_URL.');
    this.name = 'OrderApiConfigError';
  }
}

export class OrderApiError extends Error {
  readonly status: number | null;
  readonly code: string | null;

  constructor(status: number | null, message: string, code: string | null) {
    super(message);
    this.name = 'OrderApiError';
    this.status = status;
    this.code = code;
  }
}

export type OrderMoneyJson = {
  amount: number;
  currency: string;
};

export type LineModifierJson = {
  modifierId: string;
  name: string;
  kind: string;
  price: OrderMoneyJson | null;
};

export type LineItemJson = {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: OrderMoneyJson;
  applicableTax: {
    basisPoints: number;
  };
  modifiers: LineModifierJson[];
};

export type OrderStatusJson =
  | 'OPEN'
  | 'SENT_TO_KITCHEN'
  | 'IN_KITCHEN'
  | 'READY'
  | 'CLOSED'
  | 'CANCELLED';

export type OrderActionJson =
  | 'editLines'
  | 'sendToKitchen'
  | 'beginCooking'
  | 'markReady'
  | 'cancel'
  | 'close';

export type OrderJson = {
  id: string;
  tableId: string | null;
  externalOrderId: string | null;
  status: OrderStatusJson;
  openedAt: string;
  allowedActions: OrderActionJson[];
  lines: LineItemJson[];
};

export type OpenOrderBody =
  | { tableId: string }
  | { externalOrderId: string };

export type AddLineBody = {
  menuItemId: string;
  quantity: number;
  modifierIds: string[];
};

export type ModifyLineBody = {
  quantity: number;
  modifierIds: string[];
};

export function openOrder(body: OpenOrderBody): Promise<OrderJson> {
  return request('/orders', 'POST', body, asOrder);
}

export function listOrders(statuses: readonly string[]): Promise<OrderJson[]> {
  const status = statuses.map((value) => encodeURIComponent(value)).join(',');
  return request(`/orders?status=${status}`, 'GET', undefined, asOrderList);
}

export function getOrder(orderId: string): Promise<OrderJson> {
  return request(`/orders/${encodeURIComponent(orderId)}`, 'GET', undefined, asOrder);
}

export function addLine(orderId: string, body: AddLineBody): Promise<OrderJson> {
  return request(`/orders/${encodeURIComponent(orderId)}/lines`, 'POST', body, asOrder);
}

export function modifyLine(
  orderId: string,
  lineId: string,
  body: ModifyLineBody,
): Promise<OrderJson> {
  return request(
    `/orders/${encodeURIComponent(orderId)}/lines/${encodeURIComponent(lineId)}`,
    'PATCH',
    body,
    asOrder,
  );
}

export function cancelLine(orderId: string, lineId: string): Promise<OrderJson> {
  return request(
    `/orders/${encodeURIComponent(orderId)}/lines/${encodeURIComponent(lineId)}`,
    'DELETE',
    undefined,
    asOrder,
  );
}

export function sendToKitchen(orderId: string): Promise<OrderJson> {
  return request(`/orders/${encodeURIComponent(orderId)}/send-to-kitchen`, 'POST', {}, asOrder);
}

export function beginCooking(orderId: string): Promise<OrderJson> {
  return request(`/orders/${encodeURIComponent(orderId)}/begin-cooking`, 'POST', {}, asOrder);
}

export function markOrderReady(orderId: string): Promise<OrderJson> {
  return request(`/orders/${encodeURIComponent(orderId)}/mark-ready`, 'POST', {}, asOrder);
}

export function cancelOrder(orderId: string): Promise<OrderJson> {
  return request(`/orders/${encodeURIComponent(orderId)}/cancel`, 'POST', {}, asOrder);
}

export async function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body: unknown,
  accept: (value: unknown, status: number) => T,
): Promise<T> {
  const base = requireApiUrl();
  const response = await callApi(`${base}${path}`, method, body);
  if (!response.ok) {
    throw await errorFromResponse(response);
  }

  const payload = await readJson(response);
  return accept(payload, response.status);
}

function requireApiUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new OrderApiConfigError();
  }

  return raw.trim().replace(/\/+$/, '');
}

async function callApi(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body: unknown,
): Promise<Response> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  try {
    return await fetch(url, init);
  } catch {
    throw new OrderApiError(null, 'No se pudo contactar el API.', null);
  }
}

async function errorFromResponse(response: Response): Promise<OrderApiError> {
  const payload = await readJson(response);
  if (isCodeMessage(payload)) {
    return new OrderApiError(response.status, payload.message, payload.code);
  }

  return new OrderApiError(response.status, `La petición falló (estado ${response.status}).`, null);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new OrderApiError(response.status, 'La respuesta no se pudo leer.', null);
  }
}

function isCodeMessage(value: unknown): value is { code: string; message: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as { code?: unknown; message?: unknown };
  return typeof record.code === 'string' && typeof record.message === 'string';
}

function asOrderList(value: unknown, status: number): OrderJson[] {
  if (!Array.isArray(value)) {
    throw new OrderApiError(status, 'La respuesta no es una lista de órdenes.', null);
  }

  return value as OrderJson[];
}

function asOrder(value: unknown, status: number): OrderJson {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OrderApiError(status, 'La respuesta no es una orden.', null);
  }

  return value as OrderJson;
}

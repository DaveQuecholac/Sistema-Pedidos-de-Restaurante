import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addLine,
  beginCooking,
  cancelLine,
  listOrders,
  openOrder,
  OrderApiConfigError,
  OrderApiError,
  sendToKitchen,
} from './order-api';

const fetchMock = vi.fn<typeof fetch>();

const order = {
  id: 'order-1',
  tableId: '5',
  externalOrderId: null,
  status: 'OPEN',
  openedAt: '2026-10-04T18:00:00.000Z',
  allowedActions: ['editLines', 'cancel'],
  lines: [],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('order HTTP client', () => {
  it('throws a config error before fetch when the API URL is missing (W1)', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_API_URL', undefined);
    await expect(openOrder({ tableId: '5' })).rejects.toBeInstanceOf(OrderApiConfigError);

    vi.stubEnv('NEXT_PUBLIC_API_URL', '   ');
    await expect(openOrder({ tableId: '5' })).rejects.toBeInstanceOf(OrderApiConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts openOrder with the exact body (W2)', async () => {
    stubApi(201, order);

    const created = await openOrder({ tableId: '5' });

    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/orders',
      method: 'POST',
      body: { tableId: '5' },
    });
    expect(created).toEqual(order);
  });

  it('lists orders with a comma-separated status filter (W3)', async () => {
    stubApi(200, [order]);

    await listOrders(['IN_KITCHEN', 'READY']);

    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/orders?status=IN_KITCHEN,READY',
      method: 'GET',
      body: undefined,
    });
  });

  it('encodes order ids in the path (W4)', async () => {
    stubApi(201, order);

    await addLine('o 1', {
      menuItemId: 'item-tacos',
      quantity: 2,
      modifierIds: ['mod-queso'],
    });

    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/orders/o%201/lines',
      method: 'POST',
      body: {
        menuItemId: 'item-tacos',
        quantity: 2,
        modifierIds: ['mod-queso'],
      },
    });
  });

  it('cancels a line with DELETE and no body (W5)', async () => {
    stubApi(200, order);

    await cancelLine('order-1', 'line-1');

    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/orders/order-1/lines/line-1',
      method: 'DELETE',
      body: undefined,
    });
  });

  it('reads code and message from a 409 body (W6)', async () => {
    stubApi(409, {
      code: 'OrderNotEditableError',
      message: 'Order lines cannot be edited in the current status',
    });

    await expect(addLine('order-1', { menuItemId: 'x', quantity: 1, modifierIds: [] })).rejects.toMatchObject({
      name: 'OrderApiError',
      status: 409,
      code: 'OrderNotEditableError',
      message: 'Order lines cannot be edited in the current status',
    });
  });

  it('keeps the status and does not invent a domain code when the body is not JSON (W7)', async () => {
    stubApi(500, 'nope');

    const error = await listOrders(['OPEN']).then(
      () => {
        throw new Error('expected a rejection');
      },
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(OrderApiError);
    expect(error).toMatchObject({ status: 500, code: null });
    if (error instanceof OrderApiError) {
      expect(error.code).toBeNull();
    }
  });

  it('reports a contact failure without a domain code when fetch rejects (W8)', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001');
    fetchMock.mockRejectedValue(new TypeError('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listOrders(['OPEN'])).rejects.toMatchObject({
      name: 'OrderApiError',
      status: null,
      code: null,
      message: 'No se pudo contactar el API.',
    });
  });

  it('exports kitchen transition helpers as functions (W9)', async () => {
    expect(typeof sendToKitchen).toBe('function');
    expect(typeof beginCooking).toBe('function');

    stubApi(200, order);
    await sendToKitchen('order-1');
    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/orders/order-1/send-to-kitchen',
      method: 'POST',
      body: {},
    });
  });
});

function stubApi(status: number, body: unknown): void {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001');
  fetchMock.mockResolvedValue(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
}

function requestOf(index: number): { url: string; method: string; body: unknown } {
  const [url, init] = fetchMock.mock.calls[index] ?? [];
  const raw = init?.body;
  return {
    url: String(url),
    method: init?.method ?? 'GET',
    body: typeof raw === 'string' ? (JSON.parse(raw) as unknown) : undefined,
  };
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrderApiConfigError } from '../../order-api';
import { closeOrder, getOrderPayment, type ClosedOrderJson } from './payment-api';

const fetchMock = vi.fn<typeof fetch>();

const closed: ClosedOrderJson = {
  orderId: 'order-1',
  status: 'CLOSED',
  payment: {
    id: 'pay-1',
    method: 'cash',
    amount: { amount: 16420, currency: 'MXN' },
    tendered: { amount: 20000, currency: 'MXN' },
    change: { amount: 3580, currency: 'MXN' },
    cardLast4: null,
    payerReference: null,
    reference: 'cash-r1',
    paidAt: '2026-10-04T18:00:00.000Z',
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('payment HTTP client', () => {
  it('throws a config error before fetch when the API URL is missing (W17)', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_API_URL', undefined);
    await expect(
      closeOrder('order-1', {
        expectedTotal: 16420,
        payment: { method: 'cash', tendered: 20000 },
      }),
    ).rejects.toBeInstanceOf(OrderApiConfigError);

    vi.stubEnv('NEXT_PUBLIC_API_URL', '   ');
    await expect(getOrderPayment('order-1')).rejects.toBeInstanceOf(OrderApiConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('encodes the order id when closing (W18)', async () => {
    stubApi(200, closed);

    await closeOrder('o 1', {
      expectedTotal: 16420,
      payment: { method: 'cash', tendered: 20000 },
    });

    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/orders/o%201/close',
      method: 'POST',
      body: { expectedTotal: 16420, payment: { method: 'cash', tendered: 20000 } },
    });
  });

  it('posts cash close with the exact body (W19)', async () => {
    stubApi(200, closed);

    await closeOrder('order-1', {
      expectedTotal: 16420,
      payment: { method: 'cash', tendered: 20000 },
    });

    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/orders/order-1/close',
      method: 'POST',
      body: { expectedTotal: 16420, payment: { method: 'cash', tendered: 20000 } },
    });
  });

  it('posts card and digital gateway bodies exactly (W20)', async () => {
    stubApi(200, closed);
    await closeOrder('order-1', {
      expectedTotal: 16420,
      payment: { method: 'card', cardLast4: '4242' },
    });
    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/orders/order-1/close',
      method: 'POST',
      body: { expectedTotal: 16420, payment: { method: 'card', cardLast4: '4242' } },
    });

    fetchMock.mockReset();
    stubApi(200, closed);
    await closeOrder('order-1', {
      expectedTotal: 16420,
      payment: { method: 'digitalGateway', payerReference: 'cliente@correo.mx' },
    });
    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/orders/order-1/close',
      method: 'POST',
      body: {
        expectedTotal: 16420,
        payment: { method: 'digitalGateway', payerReference: 'cliente@correo.mx' },
      },
    });
  });

  it('gets the order payment (W21)', async () => {
    stubApi(200, closed);

    const result = await getOrderPayment('order-1');

    expect(result).toEqual(closed);
    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/orders/order-1/payment',
      method: 'GET',
      body: undefined,
    });
  });

  it('reads code and message from a 402 body (W22)', async () => {
    stubApi(402, {
      code: 'PaymentDeclinedError',
      message: 'Payment was declined by the processor',
    });

    await expect(
      closeOrder('order-1', {
        expectedTotal: 16420,
        payment: { method: 'card', cardLast4: '0002' },
      }),
    ).rejects.toMatchObject({
      name: 'OrderApiError',
      status: 402,
      code: 'PaymentDeclinedError',
      message: 'Payment was declined by the processor',
    });
  });

  it('reports a contact failure when fetch rejects (W23)', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001');
    fetchMock.mockRejectedValue(new TypeError('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getOrderPayment('order-1')).rejects.toMatchObject({
      name: 'OrderApiError',
      status: null,
      code: null,
      message: 'No se pudo contactar el API.',
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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrderApiConfigError } from '../../order-api';
import { getOrderTotals, setOrderDiscount, setOrderTip } from './totals-api';

const fetchMock = vi.fn<typeof fetch>();

const totals = {
  orderId: 'order-1',
  currency: 'MXN',
  adjustable: true,
  lines: [],
  subtotal: { amount: 14500, currency: 'MXN' },
  discount: null,
  taxes: [],
  taxTotal: { amount: 1920, currency: 'MXN' },
  tip: null,
  total: { amount: 16420, currency: 'MXN' },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('totals HTTP client', () => {
  it('throws a config error before fetch when the API URL is missing (W10)', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_API_URL', undefined);
    await expect(getOrderTotals('order-1')).rejects.toBeInstanceOf(OrderApiConfigError);

    vi.stubEnv('NEXT_PUBLIC_API_URL', '   ');
    await expect(getOrderTotals('order-1')).rejects.toBeInstanceOf(OrderApiConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('encodes the order id when reading totals (W11)', async () => {
    stubApi(200, totals);

    await getOrderTotals('o 1');

    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/orders/o%201/totals',
      method: 'GET',
      body: undefined,
    });
  });

  it('puts a percentage discount with the exact body (W12)', async () => {
    stubApi(200, totals);

    await setOrderDiscount('order-1', { kind: 'percentage', basisPoints: 1000 });

    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/orders/order-1/discount',
      method: 'PUT',
      body: { discount: { kind: 'percentage', basisPoints: 1000 } },
    });
  });

  it('puts a null discount body (W13)', async () => {
    stubApi(200, totals);

    await setOrderDiscount('order-1', null);

    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/orders/order-1/discount',
      method: 'PUT',
      body: { discount: null },
    });
  });

  it('puts a fixed tip with the exact body (W14)', async () => {
    stubApi(200, totals);

    await setOrderTip('order-1', { kind: 'fixedAmount', amount: 2000 });

    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/orders/order-1/tip',
      method: 'PUT',
      body: { tip: { kind: 'fixedAmount', amount: 2000 } },
    });
  });

  it('reads code and message from a 409 body (W15)', async () => {
    stubApi(409, {
      code: 'OrderTotalsNotAdjustableError',
      message: 'Order totals cannot be adjusted in the current status',
    });

    await expect(
      setOrderTip('order-1', { kind: 'percentage', basisPoints: 1000 }),
    ).rejects.toMatchObject({
      name: 'OrderApiError',
      status: 409,
      code: 'OrderTotalsNotAdjustableError',
      message: 'Order totals cannot be adjusted in the current status',
    });
  });

  it('reports a contact failure when fetch rejects (W16)', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001');
    fetchMock.mockRejectedValue(new TypeError('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getOrderTotals('order-1')).rejects.toMatchObject({
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

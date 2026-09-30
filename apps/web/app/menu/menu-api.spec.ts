import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMenuItem,
  deactivateMenuItem,
  listMenuItems,
  MenuApiConfigError,
  MenuApiError,
  updateMenuItem,
} from './menu-api';

const fetchMock = vi.fn<typeof fetch>();

const dish = {
  id: 'd11d0b9f-dd9b-4010-b0fe-1ad1a63a62fa',
  name: 'Tacos de suadero',
  price: { amount: 4500, currency: 'MXN' },
  applicableTax: { basisPoints: 1600 },
  active: false,
  ingredients: [{ id: 'ing-1', name: 'Sin cebolla' }],
  modifiers: [
    { id: 'mod-extra', name: 'Queso', kind: 'extra', price: { amount: 1500, currency: 'MXN' } },
    { id: 'mod-exclusion', name: 'Sin cebolla', kind: 'exclusion', price: null },
  ],
};

const createBody = {
  name: 'Quesadilla',
  price: { amount: 3250, currency: 'MXN' },
  applicableTax: { basisPoints: 1600 },
  ingredients: [{ name: 'Sin cebolla' }],
  modifiers: [
    { name: 'Queso', kind: 'extra', price: { amount: 1000, currency: 'MXN' } },
    { name: 'Sin cebolla', kind: 'exclusion' },
  ],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('menu HTTP client', () => {
  it('throws a config error before fetch when the API URL is missing or blank', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_API_URL', undefined);
    await expect(listMenuItems()).rejects.toBeInstanceOf(MenuApiConfigError);

    vi.stubEnv('NEXT_PUBLIC_API_URL', '   ');
    await expect(listMenuItems()).rejects.toBeInstanceOf(MenuApiConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists dishes and keeps a null exclusion price', async () => {
    stubApi(200, [dish]);

    const items = await listMenuItems();

    expect(requestOf(0)).toEqual({ url: 'http://localhost:3001/menu-items', method: 'GET', body: undefined });
    expect(items).toEqual([dish]);
    expect(items[0]?.modifiers[1]?.price).toBeNull();
  });

  it('posts the create body unchanged and patches the chosen id', async () => {
    stubApi(201, { ...dish, name: 'Quesadilla' });
    await createMenuItem(createBody);
    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/menu-items',
      method: 'POST',
      body: createBody,
    });

    fetchMock.mockReset();
    stubApi(200, { ...dish, name: 'Quesadilla grande', active: true });
    const updateBody = { ...createBody, name: 'Quesadilla grande', active: true };
    await updateMenuItem(dish.id, updateBody);
    expect(requestOf(0)).toEqual({
      url: `http://localhost:3001/menu-items/${dish.id}`,
      method: 'PATCH',
      body: updateBody,
    });
  });

  it('deactivates with an empty object', async () => {
    stubApi(200, { ...dish, active: false });

    await deactivateMenuItem(dish.id);

    expect(requestOf(0)).toEqual({
      url: `http://localhost:3001/menu-items/${dish.id}/deactivate`,
      method: 'POST',
      body: {},
    });
  });

  it('reads code and message from an error body', async () => {
    stubApi(422, { code: 'BlankNameError', message: 'Name must not be blank' });

    await expect(createMenuItem(createBody)).rejects.toMatchObject({
      name: 'MenuApiError',
      status: 422,
      code: 'BlankNameError',
      message: 'Name must not be blank',
    });
  });

  it('keeps the status and does not invent a domain code when the error body is not that object', async () => {
    stubApi(500, 'nope');

    const error = await listMenuItems().then(
      () => {
        throw new Error('expected a rejection');
      },
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(MenuApiError);
    expect(error).toMatchObject({ status: 500, code: null });
    if (error instanceof MenuApiError) {
      expect(error.code).toBeNull();
    }
  });

  it('reports a contact failure without a domain code when fetch rejects', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001');
    fetchMock.mockRejectedValue(new TypeError('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listMenuItems()).rejects.toMatchObject({
      name: 'MenuApiError',
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

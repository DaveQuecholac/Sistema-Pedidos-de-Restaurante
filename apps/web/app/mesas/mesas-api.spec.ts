import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activateTable,
  createTable,
  deactivateTable,
  getTable,
  listTables,
  TablesApiConfigError,
  TablesApiError,
  updateTable,
} from './mesas-api';

const fetchMock = vi.fn<typeof fetch>();

const table = {
  id: '7',
  label: '7',
  zone: 'Salón',
  active: true,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('tables HTTP client', () => {
  it('throws a config error before fetch when the API URL is missing (W1)', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_API_URL', undefined);
    await expect(listTables()).rejects.toBeInstanceOf(TablesApiConfigError);

    vi.stubEnv('NEXT_PUBLIC_API_URL', '   ');
    await expect(listTables()).rejects.toBeInstanceOf(TablesApiConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists tables with GET (W2)', async () => {
    stubApi(200, [table]);

    const listed = await listTables();

    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/tables',
      method: 'GET',
      body: undefined,
    });
    expect(listed).toEqual([table]);
  });

  it('gets one table and encodes the id (W3)', async () => {
    stubApi(200, table);

    await getTable('mesa 1');

    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/tables/mesa%201',
      method: 'GET',
      body: undefined,
    });
  });

  it('creates a table with the exact body (W4)', async () => {
    stubApi(201, table);

    const created = await createTable({ id: '7', label: '7' });

    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/tables',
      method: 'POST',
      body: { id: '7', label: '7' },
    });
    expect(created).toEqual(table);
  });

  it('updates label and zone (W5)', async () => {
    stubApi(200, { ...table, label: 'Ventana', zone: 'Terraza' });

    await updateTable('7', { label: 'Ventana', zone: 'Terraza' });

    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/tables/7',
      method: 'PATCH',
      body: { label: 'Ventana', zone: 'Terraza' },
    });
  });

  it('deactivates and activates with an empty body (W6)', async () => {
    stubApi(200, { ...table, active: false });
    await deactivateTable('7');
    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/tables/7/deactivate',
      method: 'POST',
      body: {},
    });

    fetchMock.mockReset();
    stubApi(200, table);
    await activateTable('7');
    expect(requestOf(0)).toEqual({
      url: 'http://localhost:3001/tables/7/activate',
      method: 'POST',
      body: {},
    });
  });

  it('reads code and message from a 409 body (W7)', async () => {
    stubApi(409, {
      code: 'TableAlreadyExistsError',
      message: 'Table already exists',
    });

    await expect(createTable({ id: '7', label: '7' })).rejects.toMatchObject({
      name: 'TablesApiError',
      status: 409,
      code: 'TableAlreadyExistsError',
      message: 'Table already exists',
    });
  });

  it('keeps the status and does not invent a domain code when the body is not JSON (W8)', async () => {
    stubApi(500, 'nope');

    const error = await listTables().then(
      () => {
        throw new Error('expected a rejection');
      },
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(TablesApiError);
    expect(error).toMatchObject({ status: 500, code: null });
  });

  it('reports a contact failure without a domain code when fetch rejects (W9)', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001');
    fetchMock.mockRejectedValue(new TypeError('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listTables()).rejects.toMatchObject({
      name: 'TablesApiError',
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

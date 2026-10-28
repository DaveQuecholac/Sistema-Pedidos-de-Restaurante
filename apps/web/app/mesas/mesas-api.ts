export class TablesApiConfigError extends Error {
  constructor() {
    super('Falta NEXT_PUBLIC_API_URL.');
    this.name = 'TablesApiConfigError';
  }
}

export class TablesApiError extends Error {
  readonly status: number | null;
  readonly code: string | null;

  constructor(status: number | null, message: string, code: string | null) {
    super(message);
    this.name = 'TablesApiError';
    this.status = status;
    this.code = code;
  }
}

export type TableJson = {
  id: string;
  label: string;
  zone: string;
  active: boolean;
};

export type CreateTableBody = {
  id: string;
  label: string;
  zone?: string;
};

export type UpdateTableBody = {
  label: string;
  zone: string;
};

export function listTables(): Promise<TableJson[]> {
  return request('/tables', 'GET', undefined, asTableList);
}

export function getTable(tableId: string): Promise<TableJson> {
  return request(`/tables/${encodeURIComponent(tableId)}`, 'GET', undefined, asTable);
}

export function createTable(body: CreateTableBody): Promise<TableJson> {
  return request('/tables', 'POST', body, asTable);
}

export function updateTable(tableId: string, body: UpdateTableBody): Promise<TableJson> {
  return request(`/tables/${encodeURIComponent(tableId)}`, 'PATCH', body, asTable);
}

export function deactivateTable(tableId: string): Promise<TableJson> {
  return request(`/tables/${encodeURIComponent(tableId)}/deactivate`, 'POST', {}, asTable);
}

export function activateTable(tableId: string): Promise<TableJson> {
  return request(`/tables/${encodeURIComponent(tableId)}/activate`, 'POST', {}, asTable);
}

async function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
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
    throw new TablesApiConfigError();
  }

  return raw.trim().replace(/\/+$/, '');
}

async function callApi(
  url: string,
  method: 'GET' | 'POST' | 'PATCH',
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
    throw new TablesApiError(null, 'No se pudo contactar el API.', null);
  }
}

async function errorFromResponse(response: Response): Promise<TablesApiError> {
  const payload = await readJson(response);
  if (isCodeMessage(payload)) {
    return new TablesApiError(response.status, payload.message, payload.code);
  }

  return new TablesApiError(response.status, `La petición falló (estado ${response.status}).`, null);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new TablesApiError(response.status, 'La respuesta no se pudo leer.', null);
  }
}

function isCodeMessage(value: unknown): value is { code: string; message: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as { code?: unknown; message?: unknown };
  return typeof record.code === 'string' && typeof record.message === 'string';
}

function asTableList(value: unknown, status: number): TableJson[] {
  if (!Array.isArray(value)) {
    throw new TablesApiError(status, 'La respuesta no es una lista de mesas.', null);
  }

  return value as TableJson[];
}

function asTable(value: unknown, status: number): TableJson {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TablesApiError(status, 'La respuesta no es una mesa.', null);
  }

  return value as TableJson;
}

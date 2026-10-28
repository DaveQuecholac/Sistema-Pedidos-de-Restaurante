export class MenuApiConfigError extends Error {
  constructor() {
    super('Falta NEXT_PUBLIC_API_URL.');
    this.name = 'MenuApiConfigError';
  }
}

export class MenuApiError extends Error {
  readonly status: number | null;
  readonly code: string | null;

  constructor(status: number | null, message: string, code: string | null) {
    super(message);
    this.name = 'MenuApiError';
    this.status = status;
    this.code = code;
  }
}

export type MenuMoneyJson = {
  amount: number;
  currency: string;
};

export type MenuIngredientJson = {
  id: string;
  name: string;
};

export type MenuIngredientWrite = {
  name: string;
};

export type MenuModifierJson = {
  id: string;
  name: string;
  kind: string;
  price: MenuMoneyJson | null;
};

export type MenuItemJson = {
  id: string;
  name: string;
  price: MenuMoneyJson;
  applicableTax: {
    basisPoints: number;
  };
  active: boolean;
  ingredients: MenuIngredientJson[];
  modifiers: MenuModifierJson[];
};

export type MenuModifierWrite = {
  name: string;
  kind: string;
  price?: MenuMoneyJson;
};

export type CreateMenuItemBody = {
  name: string;
  price: MenuMoneyJson;
  applicableTax: {
    basisPoints: number;
  };
  ingredients: MenuIngredientWrite[];
  modifiers: MenuModifierWrite[];
};

export type UpdateMenuItemBody = CreateMenuItemBody & {
  active: boolean;
};

export function listMenuItems(): Promise<MenuItemJson[]> {
  return request('/menu-items', 'GET', undefined, asMenuList);
}

export function createMenuItem(body: CreateMenuItemBody): Promise<MenuItemJson> {
  return request('/menu-items', 'POST', body, asMenuItem);
}

export function updateMenuItem(id: string, body: UpdateMenuItemBody): Promise<MenuItemJson> {
  return request(`/menu-items/${encodeURIComponent(id)}`, 'PATCH', body, asMenuItem);
}

export function deactivateMenuItem(id: string): Promise<MenuItemJson> {
  return request(`/menu-items/${encodeURIComponent(id)}/deactivate`, 'POST', {}, asMenuItem);
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
    throw new MenuApiConfigError();
  }

  return raw.trim().replace(/\/+$/, '');
}

async function callApi(url: string, method: 'GET' | 'POST' | 'PATCH', body: unknown): Promise<Response> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  try {
    return await fetch(url, init);
  } catch {
    throw new MenuApiError(null, 'No se pudo contactar el API.', null);
  }
}

async function errorFromResponse(response: Response): Promise<MenuApiError> {
  const payload = await readJson(response);
  if (isCodeMessage(payload)) {
    return new MenuApiError(response.status, payload.message, payload.code);
  }

  return new MenuApiError(response.status, `La petición falló (estado ${response.status}).`, null);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MenuApiError(response.status, 'La respuesta no se pudo leer.', null);
  }
}

function isCodeMessage(value: unknown): value is { code: string; message: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as { code?: unknown; message?: unknown };
  return typeof record.code === 'string' && typeof record.message === 'string';
}

function asMenuList(value: unknown, status: number): MenuItemJson[] {
  if (!Array.isArray(value)) {
    throw new MenuApiError(status, 'La respuesta no es una lista de platos.', null);
  }

  return value as MenuItemJson[];
}

function asMenuItem(value: unknown, status: number): MenuItemJson {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MenuApiError(status, 'La respuesta no es un plato.', null);
  }

  return value as MenuItemJson;
}

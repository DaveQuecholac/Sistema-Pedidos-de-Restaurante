import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import postgres, { type Sql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const integrationOn = process.env.MENU_GRPC_INTEGRATION === '1';
const describeIntegration = integrationOn ? describe : describe.skip;

const MENU_URL = 'http://127.0.0.1:3002';
const API_URL = 'http://127.0.0.1:3001';
const root = resolve(__dirname, '../../../../..');

type MoneyJson = { amount: number; currency: string };
type MenuItemJson = {
  id: string;
  name: string;
  price: MoneyJson;
  active: boolean;
};
type LineJson = { id: string; menuItemId: string; unitPrice: MoneyJson };
type OrderJson = { id: string; status: string; lines: LineJson[] };
type TotalsJson = { total: MoneyJson };

const createdMenuIds: string[] = [];
const createdOrderIds: string[] = [];

describeIntegration('menu gRPC across processes', () => {
  let payments: Sql | undefined;

  afterAll(async () => {
    pm2('start');
    if (payments) {
      for (const orderId of createdOrderIds) {
        await payments`delete from payments where subject_id = ${orderId}`;
      }
      await payments.end({ timeout: 1 });
    }
    for (const id of createdMenuIds) {
      await fetch(`${MENU_URL}/menu-items/${id}/deactivate`, { method: 'POST', body: '{}' , headers: { 'content-type': 'application/json' } }).catch(() => undefined);
    }
  });

  it('freezes the price from Menú and a later line takes the new price (M3-7)', async () => {
    payments = postgres(paymentsDatabaseUrl(), { max: 1 });
    const dish = await createDish(1000);
    const order = await openOrder();

    const first = await addLine(order.id, dish.id);
    expect(first.status).toBe('OPEN');
    expect(first.lines).toHaveLength(1);
    expect(first.lines[0]?.menuItemId).toBe(dish.id);
    expect(first.lines[0]?.unitPrice.amount).toBe(1000);

    await patchPrice(dish, 2500);
    const afterPatch = await getOrder(order.id);
    expect(afterPatch.lines[0]?.unitPrice.amount).toBe(1000);

    const second = await addLine(order.id, dish.id);
    expect(second.lines).toHaveLength(2);
    expect(second.lines[0]?.unitPrice.amount).toBe(1000);
    expect(second.lines[1]?.unitPrice.amount).toBe(2500);
  });

  it('refuses a new line when Menú is down and still closes the ready order (M3-8)', async () => {
    const readyId = createdOrderIds[0];
    const dishId = createdMenuIds[0];
    if (!readyId || !dishId) {
      throw new Error('M3-7 did not leave an order');
    }

    await postEmpty(`${API_URL}/orders/${readyId}/send-to-kitchen`);
    await postEmpty(`${API_URL}/orders/${readyId}/begin-cooking`);
    await postEmpty(`${API_URL}/orders/${readyId}/mark-ready`);
    expect((await getOrder(readyId)).status).toBe('READY');

    pm2('stop');
    await waitUntilMenuDown();

    const other = await openOrder();
    const refused = await fetch(`${API_URL}/orders/${other.id}/lines`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ menuItemId: dishId, quantity: 1, modifierIds: [] }),
    });
    expect(refused.ok).toBe(false);
    expect((await getOrder(other.id)).lines).toHaveLength(0);

    const totals = await getJson<TotalsJson>(`${API_URL}/orders/${readyId}/totals`);
    const closed = await postJson<{ status: string }>(`${API_URL}/orders/${readyId}/close`, {
      expectedTotal: totals.total.amount,
      payment: { method: 'cash', tendered: totals.total.amount },
    });
    expect(closed.status).toBe('CLOSED');
    expect((await getOrder(readyId)).status).toBe('CLOSED');

    const payment = await fetch(`${API_URL}/orders/${readyId}/payment`);
    expect(payment.status).toBe(200);

    if (!payments) {
      throw new Error('payments client missing');
    }
    const rows = await payments<{ status: string }[]>`
      select status from payments where subject_id = ${readyId}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('approved');

    pm2('start');
    await waitUntilMenuUp();
  });
});

async function createDish(amount: number): Promise<MenuItemJson> {
  const dish = await postJson<MenuItemJson>(`${MENU_URL}/menu-items`, {
    name: 'Plato cruce M3',
    price: { amount, currency: 'MXN' },
    applicableTax: { basisPoints: 0 },
    ingredients: [{ name: 'Masa' }],
    modifiers: [],
  });
  createdMenuIds.push(dish.id);
  return dish;
}

async function patchPrice(dish: MenuItemJson, amount: number): Promise<void> {
  await patchJson(`${MENU_URL}/menu-items/${dish.id}`, {
    name: dish.name,
    price: { amount, currency: 'MXN' },
    applicableTax: { basisPoints: 0 },
    ingredients: [{ name: 'Masa' }],
    modifiers: [],
    active: true,
  });
}

async function openOrder(): Promise<OrderJson> {
  const order = await postJson<OrderJson>(`${API_URL}/orders`, {
    externalOrderId: `m3-${crypto.randomUUID()}`,
  });
  createdOrderIds.push(order.id);
  return order;
}

async function addLine(orderId: string, menuItemId: string): Promise<OrderJson> {
  return postJson<OrderJson>(`${API_URL}/orders/${orderId}/lines`, {
    menuItemId,
    quantity: 1,
    modifierIds: [],
  });
}

async function getOrder(orderId: string): Promise<OrderJson> {
  return getJson<OrderJson>(`${API_URL}/orders/${orderId}`);
}

async function postEmpty(url: string): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}: ${await response.text()}`);
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function patchJson(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}: ${await response.text()}`);
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

function pm2(action: 'start' | 'stop'): void {
  const result = spawnSync('pnpm', ['exec', 'pm2', action, 'restaurante-menu'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `pm2 ${action} failed`);
  }
}

async function waitUntilMenuDown(): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fetch(`${MENU_URL}/menu-items`);
    } catch {
      return;
    }
    await delay(250);
  }
  throw new Error('Menú followed the stop');
}

async function waitUntilMenuUp(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${MENU_URL}/menu-items`);
      if (response.ok) {
        return;
      }
    } catch {
      // process still binding
    }
    await delay(250);
  }
  throw new Error('Menú did not come back');
}

function paymentsDatabaseUrl(): string {
  if (process.env.PAYMENTS_DATABASE_URL) {
    return process.env.PAYMENTS_DATABASE_URL;
  }
  return 'postgresql://postgres:postgres@localhost:5432/payments';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const integrationOn = process.env.SALON_GRPC_INTEGRATION === '1';
const describeIntegration = integrationOn ? describe : describe.skip;

const GATEWAY = 'http://127.0.0.1:3000';
const SALON = 'http://127.0.0.1:3003';
const root = resolve(__dirname, '../../../../..');

type MoneyJson = { amount: number; currency: string };
type MenuItemJson = { id: string; name: string };
type OrderJson = { id: string; status: string; tableId: string | null; lines: { id: string }[] };
type TableJson = { id: string; label: string; zone: string; active: boolean };
type TotalsJson = { total: MoneyJson };

const createdMenuIds: string[] = [];
const createdOrderIds: string[] = [];

let tableId = '';
let dishId = '';

describeIntegration('salon through the gateway', () => {
  let salonDb: Sql | undefined;
  let ordersDb: Sql | undefined;
  let payments: Sql | undefined;

  beforeAll(async () => {
    await expectUp(`${GATEWAY}/tables`);
    await expectUp(`${GATEWAY}/menu-items`);
    await expectUp(`${SALON}/tables`);
    salonDb = postgres(databaseUrl('salon', 'SALON_DATABASE_URL'), { max: 1 });
    ordersDb = postgres(databaseUrl('restaurante', 'DATABASE_URL'), { max: 1 });
    payments = postgres(databaseUrl('payments', 'PAYMENTS_DATABASE_URL'), { max: 1 });
  });

  afterAll(async () => {
    pm2('start');
    await waitUntilSalonUp();
    for (const id of createdMenuIds) {
      await fetch(`${GATEWAY}/menu-items/${id}/deactivate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }).catch(() => undefined);
    }
    if (payments) {
      for (const orderId of createdOrderIds) {
        await payments`delete from payments where subject_id = ${orderId}`;
      }
      await payments.end({ timeout: 1 });
    }
    await salonDb?.end({ timeout: 1 });
    await ordersDb?.end({ timeout: 1 });
  });

  it('opens, cooks and closes a table order through port 3000 (S4-11)', async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    tableId = `s4-${suffix}`;
    const table = await postJson<TableJson>(`${GATEWAY}/tables`, {
      id: tableId,
      label: `Mesa ${suffix}`,
      zone: 'Cruce',
    });
    expect(table).toMatchObject({ id: tableId, active: true, zone: 'Cruce' });

    const dish = await postJson<MenuItemJson>(`${GATEWAY}/menu-items`, {
      name: `Plato cruce S4 ${suffix}`,
      price: { amount: 1000, currency: 'MXN' },
      applicableTax: { basisPoints: 0 },
      ingredients: [{ name: 'Masa' }],
      modifiers: [],
    });
    dishId = dish.id;
    createdMenuIds.push(dish.id);

    const order = await postJson<OrderJson>(`${GATEWAY}/orders`, { tableId });
    createdOrderIds.push(order.id);
    expect(order.tableId).toBe(tableId);
    expect(order.status).toBe('OPEN');

    const withLine = await postJson<OrderJson>(`${GATEWAY}/orders/${order.id}/lines`, {
      menuItemId: dish.id,
      quantity: 1,
      modifierIds: [],
    });
    expect(withLine.lines).toHaveLength(1);

    await postEmpty(`${GATEWAY}/orders/${order.id}/send-to-kitchen`);
    await postEmpty(`${GATEWAY}/orders/${order.id}/begin-cooking`);
    await postEmpty(`${GATEWAY}/orders/${order.id}/mark-ready`);
    expect((await getJson<OrderJson>(`${GATEWAY}/orders/${order.id}`)).status).toBe('READY');

    const totals = await getJson<TotalsJson>(`${GATEWAY}/orders/${order.id}/totals`);
    const closed = await postJson<OrderJson>(`${GATEWAY}/orders/${order.id}/close`, {
      expectedTotal: totals.total.amount,
      payment: { method: 'cash', tendered: totals.total.amount },
    });
    expect(closed.status).toBe('CLOSED');

    if (!salonDb || !ordersDb || !payments) {
      throw new Error('database clients missing');
    }
    const salonRows = await salonDb<{ id: string; active: boolean }[]>`
      select id, active from tables where id = ${tableId}
    `;
    expect(salonRows).toEqual([{ id: tableId, active: true }]);

    const [{ relation }] = await ordersDb<{ relation: string | null }[]>`
      select to_regclass('public.tables')::text as relation
    `;
    expect(relation).toBeNull();

    const paid = await payments<{ status: string; method: string }[]>`
      select status, method from payments where subject_id = ${order.id}
    `;
    expect(paid).toEqual([{ status: 'approved', method: 'cash' }]);
  }, 30_000);

  it('rejects deactivation while the order is open and allows it after close (S4-12)', async () => {
    if (!tableId || !dishId) {
      throw new Error('S4-11 did not leave a table');
    }

    const order = await postJson<OrderJson>(`${GATEWAY}/orders`, { tableId });
    createdOrderIds.push(order.id);
    await postJson(`${GATEWAY}/orders/${order.id}/lines`, {
      menuItemId: dishId,
      quantity: 1,
      modifierIds: [],
    });

    const refused = await fetch(`${GATEWAY}/tables/${tableId}/deactivate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: 'TableHasActiveOrderError' });
    expect((await getJson<TableJson>(`${GATEWAY}/tables/${tableId}`)).active).toBe(true);

    await postEmpty(`${GATEWAY}/orders/${order.id}/send-to-kitchen`);
    await postEmpty(`${GATEWAY}/orders/${order.id}/begin-cooking`);
    await postEmpty(`${GATEWAY}/orders/${order.id}/mark-ready`);
    const totals = await getJson<TotalsJson>(`${GATEWAY}/orders/${order.id}/totals`);
    await postJson(`${GATEWAY}/orders/${order.id}/close`, {
      expectedTotal: totals.total.amount,
      payment: { method: 'cash', tendered: totals.total.amount },
    });

    const deactivated = await postJson<TableJson>(`${GATEWAY}/tables/${tableId}/deactivate`, {});
    expect(deactivated.active).toBe(false);
    expect((await getJson<TableJson>(`${GATEWAY}/tables/${tableId}`)).active).toBe(false);
  }, 30_000);

  it('opens an external order and still charges a ready one while Salón is down (S4-13)', async () => {
    if (!dishId || !ordersDb) {
      throw new Error('S4-11 did not leave a dish');
    }

    const ready = await postJson<OrderJson>(`${GATEWAY}/orders`, {
      externalOrderId: `s4-ready-${crypto.randomUUID()}`,
    });
    createdOrderIds.push(ready.id);
    await postJson(`${GATEWAY}/orders/${ready.id}/lines`, {
      menuItemId: dishId,
      quantity: 1,
      modifierIds: [],
    });
    await postEmpty(`${GATEWAY}/orders/${ready.id}/send-to-kitchen`);
    await postEmpty(`${GATEWAY}/orders/${ready.id}/begin-cooking`);
    await postEmpty(`${GATEWAY}/orders/${ready.id}/mark-ready`);
    expect((await getJson<OrderJson>(`${GATEWAY}/orders/${ready.id}`)).status).toBe('READY');

    const [{ before }] = await ordersDb<{ before: number }[]>`
      select count(*)::int as before from orders where table_id = '1'
    `;

    pm2('stop');
    await waitUntilSalonDown();

    try {
      const external = await postJson<OrderJson>(`${GATEWAY}/orders`, {
        externalOrderId: `s4-ext-${crypto.randomUUID()}`,
      });
      createdOrderIds.push(external.id);
      expect(external.status).toBe('OPEN');
      await postEmpty(`${GATEWAY}/orders/${external.id}/cancel`);

      const refused = await fetch(`${GATEWAY}/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tableId: '1' }),
      });
      expect(refused.ok).toBe(false);
      const [{ after }] = await ordersDb<{ after: number }[]>`
        select count(*)::int as after from orders where table_id = '1'
      `;
      expect(after).toBe(before);

      const totals = await getJson<TotalsJson>(`${GATEWAY}/orders/${ready.id}/totals`);
      const closed = await postJson<OrderJson>(`${GATEWAY}/orders/${ready.id}/close`, {
        expectedTotal: totals.total.amount,
        payment: { method: 'cash', tendered: totals.total.amount },
      });
      expect(closed.status).toBe('CLOSED');
      if (!payments) {
        throw new Error('payments client missing');
      }
      const paid = await payments<{ status: string }[]>`
        select status from payments where subject_id = ${ready.id}
      `;
      expect(paid).toEqual([{ status: 'approved' }]);
    } finally {
      pm2('start');
      await waitUntilSalonUp();
    }
  }, 60_000);
});

async function expectUp(url: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} is not up (${response.status})`);
  }
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

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

function pm2(action: 'start' | 'stop'): void {
  const result = spawnSync('pnpm', ['exec', 'pm2', action, 'restaurante-salon'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `pm2 ${action} failed`);
  }
}

async function waitUntilSalonDown(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await fetch(`${SALON}/tables`);
    } catch {
      return;
    }
    await delay(250);
  }
  throw new Error('Salón followed the stop');
}

async function waitUntilSalonUp(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${SALON}/tables`);
      if (response.ok) {
        return;
      }
    } catch {
      // process still binding
    }
    await delay(500);
  }
  throw new Error('Salón did not come back');
}

function databaseUrl(name: string, envKey: string): string {
  const fromEnv = process.env[envKey];
  if (fromEnv) {
    return fromEnv;
  }
  return `postgresql://postgres:postgres@localhost:5432/${name}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

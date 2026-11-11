import { createServer, type Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGateway } from './gateway';

type Hit = { method: string; url: string; body: string };

describe('gateway', () => {
  let api: Upstream;
  let salon: Upstream;
  let menu: Upstream;
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    api = await listenUpstream('api');
    salon = await listenUpstream('salon');
    menu = await listenUpstream('menu');
    app = await createGateway(
      { api: api.base, salon: salon.base, menu: menu.base },
      { logger: false },
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    await api.close();
    await salon.close();
    await menu.close();
  });

  it('sends table catalog to Salón and the table account to the API (S4-9)', async () => {
    const created = await send('/tables', 'POST', { id: 'mesa-1', label: '1', zone: 'Salón' });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ upstream: 'salon' });
    expect(salon.hits.map((hit) => `${hit.method} ${hit.url}`)).toEqual([
      'POST /tables',
    ]);
    expect(salon.hits[0]?.body).toBe(
      JSON.stringify({ id: 'mesa-1', label: '1', zone: 'Salón' }),
    );
    expect(api.hits).toEqual([]);

    const closed = await send('/tables/mesa-1/account/close', 'POST', {});
    expect(closed.status).toBe(201);
    expect(await closed.json()).toEqual({ upstream: 'api' });
    expect(api.hits.map((hit) => `${hit.method} ${hit.url}`)).toEqual([
      'POST /tables/mesa-1/account/close',
    ]);
    expect(salon.hits).toHaveLength(1);
  });

  it('sends menu and orders onward, and answers 404 without calling Payments (S4-10)', async () => {
    const menuResponse = await send('/menu-items?active=true', 'GET');
    expect(menuResponse.status).toBe(201);
    expect(menu.hits.map((hit) => `${hit.method} ${hit.url}`)).toEqual([
      'GET /menu-items?active=true',
    ]);

    const order = await send('/orders', 'POST', { externalOrderId: 'UBER-1' });
    expect(order.status).toBe(201);
    expect(api.hits.some((hit) => hit.method === 'POST' && hit.url === '/orders')).toBe(true);
    expect(api.hits.find((hit) => hit.url === '/orders')?.body).toBe(
      JSON.stringify({ externalOrderId: 'UBER-1' }),
    );

    const before = snapshot();
    const payments = await send('/payments', 'POST', { method: 'cash' });
    const unknown = await send('/no-such-route', 'GET');

    expect(payments.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(snapshot()).toEqual(before);
  });

  function snapshot() {
    return {
      api: api.hits.length,
      salon: salon.hits.length,
      menu: menu.hits.length,
    };
  }

  function send(path: string, method: string, body?: unknown): Promise<Response> {
    return fetch(`${base}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
});

type Upstream = {
  base: string;
  hits: Hit[];
  close: () => Promise<void>;
};

function listenUpstream(label: string): Promise<Upstream> {
  const hits: Hit[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      hits.push({
        method: req.method ?? '',
        url: req.url ?? '',
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ upstream: label }));
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('upstream did not bind a port'));
        return;
      }
      resolve({
        base: `http://127.0.0.1:${address.port}`,
        hits,
        close: () => closeServer(server),
      });
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

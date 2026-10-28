import type { IncomingMessage } from 'node:http';
import type { Request, Response } from 'express';

export type UpstreamName = 'api' | 'salon' | 'menu';

export type Upstreams = Record<UpstreamName, string>;

/** First matching prefix wins. The table account stays on the API. */
export function matchUpstream(pathname: string): UpstreamName | null {
  if (/^\/tables\/[^/]+\/account(?:\/|$)/.test(pathname)) {
    return 'api';
  }
  if (pathname === '/tables' || pathname.startsWith('/tables/')) {
    return 'salon';
  }
  if (pathname === '/menu-items' || pathname.startsWith('/menu-items/')) {
    return 'menu';
  }
  if (pathname === '/orders' || pathname.startsWith('/orders/')) {
    return 'api';
  }
  return null;
}

export async function forward(req: Request, res: Response, upstreams: Upstreams): Promise<void> {
  const pathname = new URL(req.originalUrl, 'http://gateway.local').pathname;
  const target = matchUpstream(pathname);
  if (target === null) {
    res.status(404).json({ statusCode: 404, message: 'Not found' });
    return;
  }

  const method = req.method;
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);
  const headers: Record<string, string> = {};
  const contentType = req.headers['content-type'];
  if (typeof contentType === 'string' && body !== undefined && body.length > 0) {
    headers['content-type'] = contentType;
  }

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(new URL(req.originalUrl, upstreams[target]), {
      method,
      headers,
      body: body === undefined || body.length === 0 ? undefined : new Uint8Array(body),
    });
  } catch {
    if (!res.headersSent) {
      res.status(502).json({ statusCode: 502, message: 'Upstream did not respond' });
    }
    return;
  }

  const bytes = Buffer.from(await upstream.arrayBuffer());
  const responseType = upstream.headers.get('content-type');
  if (responseType) {
    res.setHeader('content-type', responseType);
  }
  res.status(upstream.status).send(bytes);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

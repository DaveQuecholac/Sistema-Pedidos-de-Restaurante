import { NestFactory } from '@nestjs/core';
import type { NestApplicationOptions } from '@nestjs/common';
import type { Request, Response } from 'express';
import { isStaffRole, issueAccessToken, parseExpiresIn, readAccessToken, type StaffRole } from './access-token';
import { forward, readBody, type Upstreams } from './forward';
import { GatewayModule } from './gateway.module';
import { gatewayOpenApi } from './openapi';

export type GatewayAuth = {
  secret: string;
  expiresInSeconds: number;
  now?: () => number;
};

export type GatewayCreateOptions = NestApplicationOptions & {
  auth: GatewayAuth;
};

const DOCS_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Gateway</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger' });
  </script>
</body>
</html>
`;

export async function createGateway(upstreams: Upstreams, options: GatewayCreateOptions) {
  const { auth, ...nestOptions } = options;
  const app = await NestFactory.create(GatewayModule, { bodyParser: false, ...nestOptions });
  app.enableCors();
  app.use((req: Request, res: Response) => {
    void handle(req, res, upstreams, auth);
  });
  return app;
}

export function authFromEnv(env: NodeJS.ProcessEnv = process.env): GatewayAuth {
  const secret = env.JWT_SECRET?.trim() ?? '';
  if (secret === '') {
    throw new Error('JWT_SECRET is required');
  }
  return {
    secret,
    expiresInSeconds: parseExpiresIn(env.JWT_EXPIRES_IN ?? '2h'),
  };
}

export function upstreamsFromEnv(): Upstreams {
  return {
    api: process.env.GATEWAY_API_URL ?? 'http://localhost:3001',
    salon: process.env.GATEWAY_SALON_URL ?? 'http://localhost:3003',
    menu: process.env.GATEWAY_MENU_URL ?? 'http://localhost:3002',
  };
}

async function handle(req: Request, res: Response, upstreams: Upstreams, auth: GatewayAuth): Promise<void> {
  const pathname = new URL(req.originalUrl, 'http://gateway.local').pathname;

  if (req.method === 'GET' && (pathname === '/docs' || pathname === '/docs/')) {
    res.type('html').send(DOCS_HTML);
    return;
  }
  if (req.method === 'GET' && pathname === '/openapi.json') {
    res.json(gatewayOpenApi);
    return;
  }
  if (req.method === 'GET' && pathname === '/health') {
    res.status(200).json({ status: 'ok' });
    return;
  }
  if (req.method === 'POST' && pathname === '/auth/login') {
    await login(req, res, auth);
    return;
  }

  const role = bearerRole(req.headers.authorization, auth);
  if (role === null) {
    res.status(401).json({ statusCode: 401, message: 'Unauthorized' });
    return;
  }

  await forward(req, res, upstreams);
}

async function login(req: Request, res: Response, auth: GatewayAuth): Promise<void> {
  let body: unknown;
  try {
    const raw = await readBody(req);
    body = raw.length === 0 ? undefined : JSON.parse(raw.toString('utf8'));
  } catch {
    res.status(400).json({ statusCode: 400, message: 'Invalid JSON' });
    return;
  }

  const role = isRecord(body) ? body.role : undefined;
  if (!isStaffRole(role)) {
    res.status(400).json({ statusCode: 400, message: 'role must be waiter, cashier or kitchen' });
    return;
  }

  const now = auth.now?.() ?? Math.floor(Date.now() / 1000);
  res.status(200).json({
    accessToken: issueAccessToken(role, auth.secret, auth.expiresInSeconds, now),
    tokenType: 'Bearer',
    expiresIn: auth.expiresInSeconds,
    role,
  });
}

function bearerRole(header: string | string[] | undefined, auth: GatewayAuth): StaffRole | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined || !value.startsWith('Bearer ')) {
    return null;
  }
  const token = value.slice('Bearer '.length).trim();
  if (token === '') {
    return null;
  }
  const now = auth.now?.() ?? Math.floor(Date.now() / 1000);
  return readAccessToken(token, auth.secret, now);
}

function isRecord(value: unknown): value is { role?: unknown } {
  return typeof value === 'object' && value !== null;
}

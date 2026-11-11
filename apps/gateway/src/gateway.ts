import { NestFactory } from '@nestjs/core';
import type { NestApplicationOptions } from '@nestjs/common';
import type { Request, Response } from 'express';
import { forward, type Upstreams } from './forward';
import { GatewayModule } from './gateway.module';

export async function createGateway(upstreams: Upstreams, options?: NestApplicationOptions) {
  const app = await NestFactory.create(GatewayModule, { bodyParser: false, ...options });
  app.enableCors();
  app.use((req: Request, res: Response) => {
    void forward(req, res, upstreams);
  });
  return app;
}

export function upstreamsFromEnv(): Upstreams {
  return {
    api: process.env.GATEWAY_API_URL ?? 'http://localhost:3001',
    salon: process.env.GATEWAY_SALON_URL ?? 'http://localhost:3003',
    menu: process.env.GATEWAY_MENU_URL ?? 'http://localhost:3002',
  };
}

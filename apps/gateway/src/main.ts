import { resolve } from 'node:path';
import { authFromEnv, createGateway, upstreamsFromEnv } from './gateway';
import { loadGatewayEnv } from './load-gateway-env';

async function bootstrap() {
  loadGatewayEnv(resolve(__dirname, '../.env'));
  let auth;
  try {
    auth = authFromEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'JWT_SECRET is required');
    process.exit(1);
  }
  const app = await createGateway(upstreamsFromEnv(), { auth });
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

void bootstrap();

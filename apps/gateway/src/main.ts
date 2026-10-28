import { resolve } from 'node:path';
import { createGateway, upstreamsFromEnv } from './gateway';
import { loadGatewayEnv } from './load-gateway-env';

async function bootstrap() {
  loadGatewayEnv(resolve(__dirname, '../.env'));
  const app = await createGateway(upstreamsFromEnv());
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

void bootstrap();

import { createRequire } from 'node:module';
import {
  credentials,
  loadPackageDefinition,
  type ChannelCredentials,
  type ServiceError,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryOrderRepository } from '../../application/order/in-memory-order-repository';
import { closedOrderL, FIXED_NOW } from '../../application/order/order-test-fixtures';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import { startActiveOrdersGrpcServer } from './active-orders-grpc-server';

const nodeRequire = createRequire(__filename);

type HasActiveOrderReply = { active?: boolean };

describe('HasActiveOrder (S4-8)', () => {
  let server: { forceShutdown: () => void };
  let hasActiveOrder: (tableId: string) => Promise<boolean>;

  beforeAll(async () => {
    const orders = new InMemoryOrderRepository();
    await orders.add(
      Order.open({
        id: 'order-open',
        origin: OrderOrigin.table('mesa-open'),
        openedAt: FIXED_NOW,
      }),
    );
    await orders.add(
      Order.restore({
        id: 'order-cancelled',
        origin: OrderOrigin.table('mesa-cancelled'),
        status: 'CANCELLED',
        openedAt: FIXED_NOW,
        lines: [],
        version: 1,
        discount: null,
        tip: null,
        payment: null,
      }),
    );
    await orders.add(closedOrderL());

    const started = await startActiveOrdersGrpcServer(orders, '127.0.0.1:0');
    server = started.server;
    const call = createCaller(`127.0.0.1:${started.port}`);
    hasActiveOrder = async (tableId) => {
      const reply = await call(tableId);
      return reply.active === true;
    };
  });

  afterAll(() => {
    server.forceShutdown();
  });

  it('is true for an OPEN order and false for CLOSED or CANCELLED (S4-8)', async () => {
    await expect(hasActiveOrder('mesa-open')).resolves.toBe(true);
    await expect(hasActiveOrder('5')).resolves.toBe(false);
    await expect(hasActiveOrder('mesa-cancelled')).resolves.toBe(false);
  });
});

type ActiveOrdersClient = {
  new (address: string, credentials: ChannelCredentials): object;
};

function createCaller(url: string): (tableId: string) => Promise<HasActiveOrderReply> {
  const protoPath = nodeRequire.resolve('@restaurante/contracts/orders.proto');
  const definition = loadSync(protoPath, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: false,
    oneofs: true,
  });
  const loaded = loadPackageDefinition(definition) as unknown as {
    restaurante: {
      orders: {
        v1: {
          ActiveOrdersService: ActiveOrdersClient;
        };
      };
    };
  };
  const client = new loaded.restaurante.orders.v1.ActiveOrdersService(url, credentials.createInsecure());
  return (tableId) => unary<HasActiveOrderReply>(client, 'HasActiveOrder', { tableId });
}

function unary<Reply>(client: object, rpc: string, request: object): Promise<Reply> {
  const target = client as Record<string, unknown>;
  const camel = rpc.charAt(0).toLowerCase() + rpc.slice(1);
  const method = target[rpc] ?? target[camel];
  if (typeof method !== 'function') {
    return Promise.reject(new Error(`RPC ${rpc} is not on the orders client`));
  }

  return new Promise((resolve, reject) => {
    method.call(client, request, (error: ServiceError | null, response?: Reply) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(response as Reply);
    });
  });
}

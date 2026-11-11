import { createRequire } from 'node:module';
import {
  credentials,
  loadPackageDefinition,
  status,
  type ChannelCredentials,
  type ServiceError,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import type { ActiveOrdersQuery } from '../../application/ports/active-orders-query';
import { ActiveOrdersUnavailableError } from '../../application/table/table-repository.errors';

const nodeRequire = createRequire(__filename);

export type HasActiveOrderReply = {
  active?: boolean;
};

/** Narrow client so the adapter can be tested without an orders process. */
export interface ActiveOrdersGrpcCaller {
  hasActiveOrder(tableId: string): Promise<HasActiveOrderReply>;
}

type ActiveOrdersClient = {
  new (address: string, credentials: ChannelCredentials): object;
};

export class GrpcActiveOrdersQuery implements ActiveOrdersQuery {
  constructor(private readonly caller: ActiveOrdersGrpcCaller) {}

  async hasActiveOrder(tableId: string): Promise<boolean> {
    let reply: HasActiveOrderReply;
    try {
      reply = await this.caller.hasActiveOrder(tableId);
    } catch (error) {
      if (grpcCode(error) === status.UNAVAILABLE) {
        throw new ActiveOrdersUnavailableError();
      }
      throw error;
    }

    if (typeof reply.active !== 'boolean') {
      throw new Error('Active orders reply is incomplete');
    }
    return reply.active;
  }
}

export function createActiveOrdersGrpcCaller(url: string): ActiveOrdersGrpcCaller {
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

  return {
    hasActiveOrder: (tableId) => unary<HasActiveOrderReply>(client, 'HasActiveOrder', { tableId }),
  };
}

function grpcCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number') {
    return error.code;
  }
  return undefined;
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

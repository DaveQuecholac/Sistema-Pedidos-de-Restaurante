import { createRequire } from 'node:module';
import {
  credentials,
  loadPackageDefinition,
  status,
  type ChannelCredentials,
  type ServiceError,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { TableCatalogUnavailableError } from '../../application/order/table-catalog.error';
import type { TableCatalog, TableSnapshot } from '../../application/ports/table-catalog';

const nodeRequire = createRequire(__filename);

export type TableCall = {
  id?: string;
  label?: string;
  zone?: string;
  active?: boolean;
};

/** Narrow client so the adapter can be tested without a salon process. */
export interface TableGrpcCaller {
  getTable(id: string): Promise<TableCall>;
}

type TableServiceClient = {
  new (address: string, credentials: ChannelCredentials): object;
};

export class GrpcTableCatalog implements TableCatalog {
  constructor(private readonly caller: TableGrpcCaller) {}

  async findById(id: string): Promise<TableSnapshot | null> {
    let reply: TableCall;
    try {
      reply = await this.caller.getTable(id);
    } catch (error) {
      if (grpcCode(error) === status.NOT_FOUND) {
        return null;
      }
      if (grpcCode(error) === status.UNAVAILABLE) {
        throw new TableCatalogUnavailableError();
      }
      throw error;
    }

    return toSnapshot(reply);
  }
}

export function createTableGrpcCaller(url: string): TableGrpcCaller {
  const protoPath = nodeRequire.resolve('@restaurante/contracts/salon.proto');
  const definition = loadSync(protoPath, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: false,
    oneofs: true,
  });
  const loaded = loadPackageDefinition(definition) as unknown as {
    restaurante: {
      salon: {
        v1: {
          TableCatalogService: TableServiceClient;
        };
      };
    };
  };
  const client = new loaded.restaurante.salon.v1.TableCatalogService(url, credentials.createInsecure());

  return {
    getTable: (id) => unary<TableCall>(client, 'GetTable', { id }),
  };
}

function toSnapshot(reply: TableCall): TableSnapshot {
  if (
    reply.id === undefined ||
    reply.label === undefined ||
    reply.zone === undefined ||
    typeof reply.active !== 'boolean'
  ) {
    throw new Error('Table catalog reply is incomplete');
  }

  return {
    id: reply.id,
    label: reply.label,
    zone: reply.zone,
    active: reply.active,
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
    return Promise.reject(new Error(`RPC ${rpc} is not on the salon client`));
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

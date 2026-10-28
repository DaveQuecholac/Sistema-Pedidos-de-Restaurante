import { createRequire } from 'node:module';
import { loadSync, type ServiceDefinition } from '@grpc/proto-loader';
import {
  loadPackageDefinition,
  Server,
  ServerCredentials,
  type ServerUnaryCall,
  type ServiceError,
  type UntypedServiceImplementation,
} from '@grpc/grpc-js';
import type { GetTable } from '../../application/table/get-table';
import type { Table } from '../../domain/table/table';
import { toServiceError } from './grpc-errors';

const nodeRequire = createRequire(__filename);

type TableSnapshotMessage = {
  id: string;
  label: string;
  zone: string;
  active: boolean;
};

export function startTableGrpcServer(
  getTable: GetTable,
  url: string,
): Promise<{ server: Server; port: number }> {
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
          TableCatalogService: { service: ServiceDefinition };
        };
      };
    };
  };
  const service = loaded.restaurante.salon.v1.TableCatalogService.service;
  const implementation: UntypedServiceImplementation = {
    [rpcName(service, 'GetTable')]: unary(async (request: { id?: string }) => {
      const table = await getTable.execute(request.id ?? '');
      return toSnapshot(table);
    }),
  };

  const server = new Server();
  server.addService(service, implementation);
  return new Promise((resolve, reject) => {
    server.bindAsync(url, ServerCredentials.createInsecure(), (error: Error | null, port: number) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ server, port });
    });
  });
}

function rpcName(service: ServiceDefinition, rpc: string): string {
  if (rpc in service) {
    return rpc;
  }
  const camel = rpc.charAt(0).toLowerCase() + rpc.slice(1);
  if (camel in service) {
    return camel;
  }
  throw new Error(`RPC ${rpc} is not in salon.proto`);
}

function unary<Request, Reply>(
  handle: (request: Request) => Promise<Reply>,
): (
  call: ServerUnaryCall<Request, Reply>,
  callback: (error: ServiceError | null, response?: Reply) => void,
) => void {
  return (call, callback) => {
    void handle(call.request).then(
      (response) => callback(null, response),
      (error: unknown) => callback(toServiceError(error)),
    );
  };
}

function toSnapshot(table: Table): TableSnapshotMessage {
  return {
    id: table.id,
    label: table.label,
    zone: table.zone,
    active: table.active,
  };
}

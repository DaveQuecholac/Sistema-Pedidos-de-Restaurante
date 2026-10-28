import { createRequire } from 'node:module';
import { loadSync, type ServiceDefinition } from '@grpc/proto-loader';
import {
  loadPackageDefinition,
  Server,
  ServerCredentials,
  status,
  type ServerUnaryCall,
  type ServiceError,
  type UntypedServiceImplementation,
} from '@grpc/grpc-js';
import type { OrderRepository } from '../../application/ports/order-repository';

const nodeRequire = createRequire(__filename);

export function startActiveOrdersGrpcServer(
  orders: OrderRepository,
  url: string,
): Promise<{ server: Server; port: number }> {
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
          ActiveOrdersService: { service: ServiceDefinition };
        };
      };
    };
  };
  const service = loaded.restaurante.orders.v1.ActiveOrdersService.service;
  const implementation: UntypedServiceImplementation = {
    [rpcName(service, 'HasActiveOrder')]: unary(async (request: { tableId?: string }) => {
      const active = await orders.listActiveByTableId(request.tableId ?? '');
      return { active: active.length > 0 };
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
  throw new Error(`RPC ${rpc} is not in orders.proto`);
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
      (error: unknown) => callback(toInternalError(error)),
    );
  };
}

function toInternalError(_error: unknown): ServiceError {
  const message = 'Active orders call failed';
  const serviceError = new Error(message) as ServiceError;
  serviceError.code = status.INTERNAL;
  serviceError.details = message;
  return serviceError;
}

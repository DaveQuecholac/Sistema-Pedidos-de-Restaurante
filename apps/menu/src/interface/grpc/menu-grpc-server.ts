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
import { MenuItemNotFoundError } from '../../application/menu/menu-item-repository.errors';
import type { MenuRepository } from '../../application/ports/menu-repository';
import type { MenuItem } from '../../domain/menu/menu-item';
import type { Modifier } from '../../domain/menu/modifier';
import { toServiceError } from './grpc-errors';

const nodeRequire = createRequire(__filename);

type MoneyMessage = {
  amount: number;
  currency: string;
};

type ModifierMessage = {
  id: string;
  name: string;
  kind: string;
  price?: MoneyMessage;
};

type MenuItemSnapshotMessage = {
  id: string;
  name: string;
  price: MoneyMessage;
  taxBasisPoints: number;
  active: boolean;
  ingredients: { id: string; name: string }[];
  modifiers: ModifierMessage[];
};

export function startMenuGrpcServer(
  menu: MenuRepository,
  url: string,
): Promise<{ server: Server; port: number }> {
  const protoPath = nodeRequire.resolve('@restaurante/contracts/menu.proto');
  const definition = loadSync(protoPath, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: false,
    oneofs: true,
  });
  const loaded = loadPackageDefinition(definition) as unknown as {
    restaurante: {
      menu: {
        v1: {
          MenuCatalogService: { service: ServiceDefinition };
        };
      };
    };
  };
  const service = loaded.restaurante.menu.v1.MenuCatalogService.service;
  const implementation: UntypedServiceImplementation = {
    [rpcName(service, 'GetMenuItem')]: unary(async (request: { id?: string }) => {
      const item = await menu.findById(request.id ?? '');
      if (item === null) {
        throw new MenuItemNotFoundError();
      }
      return toSnapshot(item);
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
  throw new Error(`RPC ${rpc} is not in menu.proto`);
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

function toSnapshot(item: MenuItem): MenuItemSnapshotMessage {
  return {
    id: item.id,
    name: item.name,
    price: { amount: item.price.amount, currency: item.price.currency },
    taxBasisPoints: item.applicableTax.basisPoints,
    active: item.active,
    ingredients: item.ingredients.map((ingredient) => ({ id: ingredient.id, name: ingredient.name })),
    modifiers: item.modifiers.map(toModifier),
  };
}

function toModifier(modifier: Modifier): ModifierMessage {
  const message: ModifierMessage = {
    id: modifier.id,
    name: modifier.name,
    kind: modifier.kind,
  };
  if (modifier.price !== null) {
    message.price = { amount: modifier.price.amount, currency: modifier.price.currency };
  }
  return message;
}

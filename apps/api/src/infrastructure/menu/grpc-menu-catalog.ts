import { createRequire } from 'node:module';
import {
  credentials,
  loadPackageDefinition,
  status,
  type ChannelCredentials,
  type ServiceError,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { MenuCatalogUnavailableError } from '../../application/order/menu-catalog.error';
import type { MenuCatalog } from '../../application/ports/menu-catalog';
import type {
  MenuIngredientSnapshot,
  MenuItemSnapshot,
  MenuModifierSnapshot,
} from '../../domain/order/menu-item-snapshot';
import { Money } from '../../domain/money/money';
import { TaxRate } from '../../domain/menu/tax-rate';

const nodeRequire = createRequire(__filename);

type MoneyMessage = {
  amount?: number;
  currency?: string;
};

export type MenuItemCall = {
  id?: string;
  name?: string;
  price?: MoneyMessage;
  taxBasisPoints?: number;
  active?: boolean;
  ingredients?: { id?: string; name?: string }[];
  modifiers?: {
    id?: string;
    name?: string;
    kind?: string;
    price?: MoneyMessage;
  }[];
};

/** Narrow client so the adapter can be tested without a menu process. */
export interface MenuGrpcCaller {
  getMenuItem(id: string): Promise<MenuItemCall>;
}

type MenuServiceClient = {
  new (address: string, credentials: ChannelCredentials): object;
};

export class GrpcMenuCatalog implements MenuCatalog {
  constructor(private readonly caller: MenuGrpcCaller) {}

  async findById(id: string): Promise<MenuItemSnapshot | null> {
    let reply: MenuItemCall;
    try {
      reply = await this.caller.getMenuItem(id);
    } catch (error) {
      if (grpcCode(error) === status.NOT_FOUND) {
        return null;
      }
      if (grpcCode(error) === status.UNAVAILABLE) {
        throw new MenuCatalogUnavailableError();
      }
      throw error;
    }

    return toSnapshot(reply);
  }
}

export function createMenuGrpcCaller(url: string): MenuGrpcCaller {
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
          MenuCatalogService: MenuServiceClient;
        };
      };
    };
  };
  const client = new loaded.restaurante.menu.v1.MenuCatalogService(url, credentials.createInsecure());

  return {
    getMenuItem: (id) => unary<MenuItemCall>(client, 'GetMenuItem', { id }),
  };
}

function toSnapshot(reply: MenuItemCall): MenuItemSnapshot {
  const price = reply.price;
  if (
    reply.id === undefined ||
    reply.name === undefined ||
    price?.amount === undefined ||
    price.currency === undefined ||
    reply.taxBasisPoints === undefined ||
    typeof reply.active !== 'boolean'
  ) {
    throw new Error('Menu catalog reply is incomplete');
  }

  return {
    id: reply.id,
    name: reply.name,
    price: Money.of(price.amount, price.currency),
    applicableTax: TaxRate.of(reply.taxBasisPoints),
    active: reply.active,
    ingredients: (reply.ingredients ?? []).map(toIngredient),
    modifiers: (reply.modifiers ?? []).map(toModifier),
  };
}

function toIngredient(message: { id?: string; name?: string }): MenuIngredientSnapshot {
  if (message.id === undefined || message.name === undefined) {
    throw new Error('Menu catalog reply is incomplete');
  }
  return { id: message.id, name: message.name };
}

function toModifier(message: {
  id?: string;
  name?: string;
  kind?: string;
  price?: MoneyMessage;
}): MenuModifierSnapshot {
  if (message.id === undefined || message.name === undefined) {
    throw new Error('Menu catalog reply is incomplete');
  }
  if (message.kind !== 'extra' && message.kind !== 'exclusion') {
    throw new Error('Menu catalog reply is incomplete');
  }

  const price = message.price;
  return {
    id: message.id,
    name: message.name,
    kind: message.kind,
    price:
      price?.amount === undefined || price.currency === undefined
        ? null
        : Money.of(price.amount, price.currency),
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
    return Promise.reject(new Error(`RPC ${rpc} is not on the menu client`));
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

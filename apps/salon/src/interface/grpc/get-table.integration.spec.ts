import { createRequire } from 'node:module';
import {
  credentials,
  loadPackageDefinition,
  status,
  type ChannelCredentials,
  type ServiceError,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import type { Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GetTable } from '../../application/table/get-table';
import { Table } from '../../domain/table/table';
import { type AppDatabase, createDatabase } from '../../infrastructure/persistence/drizzle/client';
import { DrizzleTableRepository } from '../../infrastructure/persistence/drizzle/drizzle-table-repository';
import { startTableGrpcServer } from './table-grpc-server';

const nodeRequire = createRequire(__filename);

const integrationOn = process.env.SALON_REPOSITORY_INTEGRATION === '1';

if (integrationOn && !process.env.SALON_DATABASE_URL) {
  throw new Error('SALON_DATABASE_URL is required');
}

const describeIntegration = integrationOn ? describe : describe.skip;

type TableSnapshotMessage = {
  id?: string;
  label?: string;
  zone?: string;
  active?: boolean;
};

describeIntegration('GetTable gRPC (S4-5)', () => {
  let client: Sql;
  let db: AppDatabase;
  let server: { forceShutdown: () => void } | undefined;
  let callGetTable: (id: string) => Promise<TableSnapshotMessage>;

  beforeAll(async () => {
    const url = process.env.SALON_DATABASE_URL;
    if (!url) {
      throw new Error('SALON_DATABASE_URL is required');
    }

    const opened = createDatabase(url);
    client = opened.client;
    db = opened.db;
    const started = await startTableGrpcServer(
      new GetTable(new DrizzleTableRepository(db)),
      '127.0.0.1:0',
    );
    server = started.server;
    callGetTable = createCaller(`127.0.0.1:${started.port}`);
  });

  afterAll(async () => {
    server?.forceShutdown();
    await client.end();
  });

  it('returns the snapshot and NOT_FOUND for an unknown id (S4-5)', async () => {
    const tableId = `s45-${crypto.randomUUID().slice(0, 8)}`;
    const repo = new DrizzleTableRepository(db);
    await repo.add(Table.create({ id: tableId, label: 'Ventana', zone: 'Terraza' }));

    try {
      const snapshot = await callGetTable(tableId);
      expect(snapshot).toEqual({
        id: tableId,
        label: 'Ventana',
        zone: 'Terraza',
        active: true,
      });

      await expect(callGetTable(`missing-${tableId}`)).rejects.toMatchObject({
        code: status.NOT_FOUND,
      });
    } finally {
      await client`delete from tables where id = ${tableId}`;
    }
  });
});

type TableServiceClient = {
  new (address: string, credentials: ChannelCredentials): object;
};

function createCaller(url: string): (id: string) => Promise<TableSnapshotMessage> {
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
  return (id) => unary<TableSnapshotMessage>(client, 'GetTable', { id });
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

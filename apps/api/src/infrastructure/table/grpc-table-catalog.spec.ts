import { status } from '@grpc/grpc-js';
import { describe, expect, it } from 'vitest';
import { TableCatalogUnavailableError } from '../../application/order/table-catalog.error';
import { GrpcTableCatalog, type TableCall, type TableGrpcCaller } from './grpc-table-catalog';

class FakeCaller implements TableGrpcCaller {
  reply: TableCall | Error = activeTable();

  getTable(): Promise<TableCall> {
    if (this.reply instanceof Error) {
      return Promise.reject(this.reply);
    }
    return Promise.resolve(this.reply);
  }
}

function grpcError(code: status): Error {
  const error = new Error('grpc') as Error & { code: number };
  error.code = code;
  return error;
}

function activeTable(): TableCall {
  return { id: '5', label: '5', zone: 'Salón', active: true };
}

describe('GrpcTableCatalog', () => {
  it('maps an active snapshot (S4-7)', async () => {
    const catalog = new GrpcTableCatalog(new FakeCaller());

    const table = await catalog.findById('5');

    expect(table).toEqual({ id: '5', label: '5', zone: 'Salón', active: true });
  });

  it('turns NOT_FOUND into null (S4-7)', async () => {
    const caller = new FakeCaller();
    caller.reply = grpcError(status.NOT_FOUND);
    const catalog = new GrpcTableCatalog(caller);

    await expect(catalog.findById('missing')).resolves.toBeNull();
  });

  it('turns a silent channel into TableCatalogUnavailableError (S4-7)', async () => {
    const caller = new FakeCaller();
    caller.reply = grpcError(status.UNAVAILABLE);
    const catalog = new GrpcTableCatalog(caller);

    await expect(catalog.findById('5')).rejects.toBeInstanceOf(TableCatalogUnavailableError);
    await expect(catalog.findById('5')).rejects.toThrow('Table catalog did not respond');
  });
});

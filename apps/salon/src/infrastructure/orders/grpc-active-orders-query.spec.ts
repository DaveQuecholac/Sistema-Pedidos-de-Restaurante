import { status } from '@grpc/grpc-js';
import { describe, expect, it } from 'vitest';
import { ActiveOrdersUnavailableError } from '../../application/table/table-repository.errors';
import {
  GrpcActiveOrdersQuery,
  type ActiveOrdersGrpcCaller,
  type HasActiveOrderReply,
} from './grpc-active-orders-query';

class FakeCaller implements ActiveOrdersGrpcCaller {
  reply: HasActiveOrderReply | Error = { active: true };

  hasActiveOrder(): Promise<HasActiveOrderReply> {
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

describe('GrpcActiveOrdersQuery', () => {
  it('returns the active flag from the reply', async () => {
    const query = new GrpcActiveOrdersQuery(new FakeCaller());
    await expect(query.hasActiveOrder('5')).resolves.toBe(true);

    const quiet = new FakeCaller();
    quiet.reply = { active: false };
    await expect(new GrpcActiveOrdersQuery(quiet).hasActiveOrder('5')).resolves.toBe(false);
  });

  it('turns a silent channel into ActiveOrdersUnavailableError', async () => {
    const caller = new FakeCaller();
    caller.reply = grpcError(status.UNAVAILABLE);

    await expect(new GrpcActiveOrdersQuery(caller).hasActiveOrder('5')).rejects.toBeInstanceOf(
      ActiveOrdersUnavailableError,
    );
  });
});

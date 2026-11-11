import { status, type ServiceError } from '@grpc/grpc-js';
import { TableNotFoundError } from '../../application/table/table-repository.errors';

export function toServiceError(error: unknown): ServiceError {
  const missing = error instanceof TableNotFoundError;
  const code = missing ? status.NOT_FOUND : status.INTERNAL;
  const message = missing ? error.message : 'Table catalog call failed';
  const serviceError = new Error(message) as ServiceError;
  serviceError.code = code;
  serviceError.details = message;
  return serviceError;
}

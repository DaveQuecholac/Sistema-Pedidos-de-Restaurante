import { status, type ServiceError } from '@grpc/grpc-js';
import { MenuItemNotFoundError } from '../../application/menu/menu-item-repository.errors';

export function toServiceError(error: unknown): ServiceError {
  const missing = error instanceof MenuItemNotFoundError;
  const code = missing ? status.NOT_FOUND : status.INTERNAL;
  const message = missing ? error.message : 'Menu catalog call failed';
  const serviceError = new Error(message) as ServiceError;
  serviceError.code = code;
  serviceError.details = message;
  return serviceError;
}

import { ZodError } from 'zod';
import { MenuItemNotFoundError } from '../../../application/menu/menu-item-repository.errors';
import {
  ExternalOrderIdInUseError,
  OrderConcurrencyError,
  OrderMappingError,
  OrderNotFoundError,
} from '../../../application/order/order-repository.errors';
import {
  TableAlreadyHasActiveOrderError,
  TableInactiveError,
  TableNotFoundError,
} from '../../../application/table/table-repository.errors';
import {
  DuplicateModifierSelectionError,
  EmptyOrderError,
  InvalidExternalOrderIdError,
  InvalidOrderOriginError,
  InvalidOrderTransitionError,
  InvalidQuantityError,
  InvalidTableIdError,
  LineItemNotFoundError,
  MenuItemUnavailableError,
  OrderNotEditableError,
  UnknownModifierError,
} from '../../../domain/order/order.errors';

export type OrderHttpErrorBody = {
  code: string;
  message: string;
};

type OrderHttpError = {
  status: number;
  body: OrderHttpErrorBody;
};

const translations: ReadonlyArray<{
  accept: (error: unknown) => error is Error;
  status: number;
}> = [
  {
    accept: (error): error is InvalidTableIdError => error instanceof InvalidTableIdError,
    status: 422,
  },
  {
    accept: (error): error is InvalidExternalOrderIdError =>
      error instanceof InvalidExternalOrderIdError,
    status: 422,
  },
  {
    accept: (error): error is InvalidOrderOriginError => error instanceof InvalidOrderOriginError,
    status: 422,
  },
  {
    accept: (error): error is InvalidQuantityError => error instanceof InvalidQuantityError,
    status: 422,
  },
  {
    accept: (error): error is MenuItemNotFoundError => error instanceof MenuItemNotFoundError,
    status: 422,
  },
  {
    accept: (error): error is MenuItemUnavailableError => error instanceof MenuItemUnavailableError,
    status: 422,
  },
  {
    accept: (error): error is UnknownModifierError => error instanceof UnknownModifierError,
    status: 422,
  },
  {
    accept: (error): error is DuplicateModifierSelectionError =>
      error instanceof DuplicateModifierSelectionError,
    status: 422,
  },
  {
    accept: (error): error is EmptyOrderError => error instanceof EmptyOrderError,
    status: 422,
  },
  {
    accept: (error): error is OrderNotFoundError => error instanceof OrderNotFoundError,
    status: 404,
  },
  {
    accept: (error): error is LineItemNotFoundError => error instanceof LineItemNotFoundError,
    status: 404,
  },
  {
    accept: (error): error is OrderNotEditableError => error instanceof OrderNotEditableError,
    status: 409,
  },
  {
    accept: (error): error is InvalidOrderTransitionError =>
      error instanceof InvalidOrderTransitionError,
    status: 409,
  },
  {
    accept: (error): error is ExternalOrderIdInUseError =>
      error instanceof ExternalOrderIdInUseError,
    status: 409,
  },
  {
    accept: (error): error is TableNotFoundError => error instanceof TableNotFoundError,
    status: 404,
  },
  {
    accept: (error): error is TableInactiveError => error instanceof TableInactiveError,
    status: 409,
  },
  {
    accept: (error): error is TableAlreadyHasActiveOrderError =>
      error instanceof TableAlreadyHasActiveOrderError,
    status: 409,
  },
  {
    accept: (error): error is OrderConcurrencyError => error instanceof OrderConcurrencyError,
    status: 409,
  },
  {
    accept: (error): error is OrderMappingError => error instanceof OrderMappingError,
    status: 500,
  },
];

/** The only map from order errors to HTTP. Unknown errors stay untranslated. */
export function toOrderHttpError(error: unknown): OrderHttpError | null {
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    if (issue === undefined) {
      return null;
    }

    return {
      status: 400,
      body: { code: 'InvalidRequest', message: issue.message },
    };
  }

  const match = translations.find((entry) => entry.accept(error));
  if (match === undefined || !(error instanceof Error)) {
    return null;
  }

  return {
    status: match.status,
    body: { code: error.name, message: error.message },
  };
}

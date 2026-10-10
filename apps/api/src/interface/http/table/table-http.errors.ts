import { ZodError } from 'zod';
import {
  TableAlreadyExistsError,
  TableHasActiveOrderError,
  TableMappingError,
  TableNotFoundError,
} from '../../../application/table/table-repository.errors';
import {
  InvalidTableIdError,
  InvalidTableLabelError,
  InvalidTableZoneError,
} from '../../../domain/table/table.errors';

export type TableHttpErrorBody = {
  code: string;
  message: string;
};

type TableHttpError = {
  status: number;
  body: TableHttpErrorBody;
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
    accept: (error): error is InvalidTableLabelError => error instanceof InvalidTableLabelError,
    status: 422,
  },
  {
    accept: (error): error is InvalidTableZoneError => error instanceof InvalidTableZoneError,
    status: 422,
  },
  {
    accept: (error): error is TableNotFoundError => error instanceof TableNotFoundError,
    status: 404,
  },
  {
    accept: (error): error is TableAlreadyExistsError => error instanceof TableAlreadyExistsError,
    status: 409,
  },
  {
    accept: (error): error is TableHasActiveOrderError => error instanceof TableHasActiveOrderError,
    status: 409,
  },
  {
    accept: (error): error is TableMappingError => error instanceof TableMappingError,
    status: 500,
  },
];

/** The only map from table catalog errors to HTTP. Unknown errors stay untranslated. */
export function toTableHttpError(error: unknown): TableHttpError | null {
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

import { ZodError } from 'zod';
import {
  MenuItemAlreadyExistsError,
  MenuItemMappingError,
  MenuItemNotFoundError,
} from '../../../application/menu/menu-item-repository.errors';
import {
  BlankIdError,
  BlankNameError,
  ExclusionHasPriceError,
  ExtraMissingPriceError,
  InvalidModifierKindError,
} from '../../../domain/menu/menu-item.errors';
import { InvalidMoneyError } from '../../../domain/money/money';
import { InvalidTaxRateError } from '../../../domain/menu/tax-rate';

export type MenuHttpErrorBody = {
  code: string;
  message: string;
};

type MenuHttpError = {
  status: number;
  body: MenuHttpErrorBody;
};

const translations: ReadonlyArray<{
  accept: (error: unknown) => error is Error;
  status: number;
}> = [
  { accept: (error): error is BlankNameError => error instanceof BlankNameError, status: 422 },
  { accept: (error): error is BlankIdError => error instanceof BlankIdError, status: 422 },
  { accept: (error): error is InvalidMoneyError => error instanceof InvalidMoneyError, status: 422 },
  { accept: (error): error is InvalidTaxRateError => error instanceof InvalidTaxRateError, status: 422 },
  {
    accept: (error): error is InvalidModifierKindError => error instanceof InvalidModifierKindError,
    status: 422,
  },
  {
    accept: (error): error is ExtraMissingPriceError => error instanceof ExtraMissingPriceError,
    status: 422,
  },
  {
    accept: (error): error is ExclusionHasPriceError => error instanceof ExclusionHasPriceError,
    status: 422,
  },
  {
    accept: (error): error is MenuItemNotFoundError => error instanceof MenuItemNotFoundError,
    status: 404,
  },
  {
    accept: (error): error is MenuItemAlreadyExistsError => error instanceof MenuItemAlreadyExistsError,
    status: 409,
  },
  {
    accept: (error): error is MenuItemMappingError => error instanceof MenuItemMappingError,
    status: 500,
  },
];

/** The only map from catalog errors to HTTP. Unknown errors stay untranslated. */
export function toMenuHttpError(error: unknown): MenuHttpError | null {
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

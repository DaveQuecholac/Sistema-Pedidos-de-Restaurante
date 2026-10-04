import {
  basisPointsToPercentLabel,
  InvalidMenuAmountError,
  percentToBasisPoints,
  pesosToCentavos,
} from '../../../menu/menu-amount';
import { OrderApiError, type OrderJson } from '../../order-api';
import { errorText } from '../../order-view';
import type {
  AdjustmentBody,
  OrderTotalsDiscountJson,
  OrderTotalsJson,
  OrderTotalsTaxJson,
  OrderTotalsTipJson,
} from './totals-api';

export type TotalsStatus =
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown }
  | { kind: 'missing' }
  | { kind: 'ready'; order: OrderJson; totals: OrderTotalsJson };

export type ParseAdjustmentResult =
  | { ok: true; value: AdjustmentBody }
  | { ok: false; message: string };

export const TIP_PRESETS = [1000, 1500, 2000] as const;

const TOTALS_ERROR_TEXTS: Record<string, string> = {
  OrderTotalsNotAdjustableError: 'La cuenta ya no se puede ajustar.',
  InvalidPercentageError: 'El porcentaje tiene que ser de 0.01 a 100.',
  InvalidDiscountError: 'El descuento tiene que ser mayor que cero.',
  InvalidTipError: 'La propina tiene que ser mayor que cero.',
  InvalidMoneyError: 'El monto no es válido.',
  MoneyOverflowError: 'La cuenta supera el monto máximo que se puede registrar.',
};

const LOCAL_ADJUSTMENT_ERROR = 'Escribe un número válido (hasta dos decimales).';

export function taxLabel(tax: Pick<OrderTotalsTaxJson, 'basisPoints'>): string {
  return `Impuesto ${basisPointsToPercentLabel(tax.basisPoints)}`;
}

export function discountLabel(discount: OrderTotalsDiscountJson): string {
  if (discount.kind === 'percentage') {
    return `Descuento ${basisPointsToPercentLabel(discount.basisPoints)}`;
  }
  return 'Descuento (monto fijo)';
}

export function tipLabel(tip: OrderTotalsTipJson): string {
  if (tip.kind === 'percentage') {
    return `Propina ${basisPointsToPercentLabel(tip.basisPoints)}`;
  }
  return 'Propina (monto fijo)';
}

export function discountCapNotice(totals: OrderTotalsJson): string | null {
  const discount = totals.discount;
  if (discount === null || discount.kind !== 'fixedAmount') {
    return null;
  }

  if (discount.requested.amount > discount.amount.amount) {
    return 'El descuento se ajustó al subtotal.';
  }

  return null;
}

export function parseAdjustment(
  mode: 'percentage' | 'fixedAmount',
  text: string,
): ParseAdjustmentResult {
  try {
    if (mode === 'percentage') {
      return {
        ok: true,
        value: { kind: 'percentage', basisPoints: percentToBasisPoints(text) },
      };
    }

    return {
      ok: true,
      value: { kind: 'fixedAmount', amount: pesosToCentavos(text) },
    };
  } catch (error) {
    if (error instanceof InvalidMenuAmountError) {
      return { ok: false, message: LOCAL_ADJUSTMENT_ERROR };
    }
    throw error;
  }
}

export function totalsErrorText(error: unknown): string {
  if (error instanceof OrderApiError && error.code !== null) {
    const known = TOTALS_ERROR_TEXTS[error.code];
    if (known !== undefined) {
      return known;
    }
  }

  return errorText(error);
}

export function totalsView(status: TotalsStatus): 'loading' | 'error' | 'missing' | 'ready' {
  return status.kind;
}

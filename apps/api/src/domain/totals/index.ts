/** Totals calculation — percentage, discount, tip and order totals. */
export { Discount, type AdjustmentKind } from './discount';
export {
  calculateTotals,
  type OrderTotals,
  type OrderTotalsLine,
  type TotalsLine,
} from './order-totals';
export { Percentage } from './percentage';
export { Tip } from './tip';
export {
  InvalidDiscountError,
  InvalidPercentageError,
  InvalidTipError,
} from './totals.errors';


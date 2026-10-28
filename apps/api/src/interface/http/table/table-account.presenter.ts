import type { TableAccountView } from '../../../application/table/get-table-account';
import { presentOrderTotals } from '../totals/totals.presenter';

export function presentTableAccount(tableId: string, account: TableAccountView) {
  const adjustable = account.sitting !== null && account.sitting.status === 'OPEN' && account.orders.length > 0;
  return {
    tableId,
    billingMode: account.sitting?.billingMode ?? 'combined',
    canClose: account.canClose,
    adjustable,
    orders: account.orders.map((order) => ({
      id: order.id,
      status: order.status,
      openedAt: order.openedAt.toISOString(),
      lines: order.lines.map((line) => ({
        name: line.name,
        quantity: line.quantity.amount,
      })),
    })),
    totals:
      account.totals === null
        ? null
        : presentOrderTotals({
            orderId: tableId,
            adjustable,
            totals: account.totals,
          }),
  };
}

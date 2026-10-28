import { Money } from '../../domain/money/money';
import { ChargeRequest } from '../../domain/payment/charge-request';
import { Payment } from '../../domain/payment/payment';
import type { PaymentMethod } from '../../domain/payment/payment-method';
import { PaymentAmountMismatchError } from '../../domain/payment/payment.errors';
import {
  NoOpenTableSittingError,
  TableAccountEmptyError,
  TableAccountNotReadyError,
} from '../../domain/table/table-sitting';
import { billableOrders, tableAccountCanClose, tableAccountTotals } from '../../domain/totals/table-account';
import type { OrderRepository } from '../ports/order-repository';
import type { PaymentPort } from '../ports/payment-port';
import type { TableSittingRepository } from '../ports/table-sitting-repository';
import { toPaymentDetails, type PaymentCommand } from '../payment/payment-command';
import {
  PaymentDeclinedError,
  PaymentMethodUnavailableError,
  PaymentPortConfigurationError,
  PaymentVoidFailedError,
} from '../payment/payment.errors';

export type CloseTableAccountCommand = {
  tableId: string;
  expectedTotal: number;
  payment: PaymentCommand;
};

export class CloseTableAccount {
  private readonly portsByMethod: Map<PaymentMethod, PaymentPort>;

  constructor(
    private readonly orders: OrderRepository,
    private readonly sittings: TableSittingRepository,
    payments: readonly PaymentPort[],
    private readonly newPaymentId: () => string,
    private readonly now: () => Date,
  ) {
    this.portsByMethod = new Map();
    for (const port of payments) {
      if (this.portsByMethod.has(port.method)) {
        throw new PaymentPortConfigurationError();
      }
      this.portsByMethod.set(port.method, port);
    }
  }

  async execute(command: CloseTableAccountCommand): Promise<{ payment: Payment; orderIds: string[] }> {
    const sitting = await this.sittings.findOpenByTableId(command.tableId);
    if (sitting === null || sitting.billingMode !== 'combined') {
      throw new NoOpenTableSittingError();
    }

    const openOrders = billableOrders(await this.orders.listBySittingId(sitting.id));
    if (openOrders.length === 0) {
      throw new TableAccountEmptyError();
    }
    if (!tableAccountCanClose(openOrders)) {
      throw new TableAccountNotReadyError();
    }

    const totals = tableAccountTotals({
      orders: openOrders,
      discount: sitting.discount,
      tip: sitting.tip,
    });
    const expectedTotal = Money.of(command.expectedTotal, 'MXN');
    if (!expectedTotal.equals(totals.total)) {
      throw new PaymentAmountMismatchError();
    }

    const details = toPaymentDetails(command.payment);
    const request = ChargeRequest.of({
      orderId: sitting.id,
      amount: totals.total,
      details,
    });
    const port = this.portsByMethod.get(request.method);
    if (port === undefined) {
      throw new PaymentMethodUnavailableError();
    }

    const result = await port.charge(request);
    if (result.outcome === 'declined') {
      throw new PaymentDeclinedError(result.reason);
    }

    const payment = Payment.record({
      id: this.newPaymentId(),
      request,
      reference: result.reference,
      paidAt: this.now(),
    });

    try {
      for (const order of openOrders) {
        await this.orders.save(order.closeOnTableAccount(sitting.id));
      }
      await this.sittings.save(sitting.closeWithPayment(payment));
    } catch (error) {
      try {
        await port.voidCharge(result.reference);
      } catch {
        throw new PaymentVoidFailedError(error);
      }
      throw error;
    }

    return { payment, orderIds: openOrders.map((order) => order.id) };
  }
}

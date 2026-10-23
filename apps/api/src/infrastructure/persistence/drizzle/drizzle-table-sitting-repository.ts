import { eq } from 'drizzle-orm';
import type { TableSittingRepository } from '../../../application/ports/table-sitting-repository';
import {
  TableSittingAlreadyExistsError,
  TableSittingNotFoundError,
} from '../../../application/table/in-memory-table-sitting-repository';
import { PaymentDetails } from '../../../domain/payment/payment-details';
import { Payment } from '../../../domain/payment/payment';
import { Money } from '../../../domain/money/money';
import { TableSitting, type BillingMode } from '../../../domain/table/table-sitting';
import type { AppDatabase } from './client';
import { toDiscount, toDiscountColumns, toPaymentRow, toTip, toTipColumns } from './order.mapper';
import { tableSittingPayments, tableSittings } from './schema/order';
import postgres from 'postgres';

export class DrizzleTableSittingRepository implements TableSittingRepository {
  constructor(private readonly db: AppDatabase) {}

  async add(sitting: TableSitting): Promise<void> {
    try {
      await this.db.insert(tableSittings).values(toRow(sitting));
    } catch (error) {
      if (isUnique(error)) {
        throw new TableSittingAlreadyExistsError();
      }
      throw error;
    }
  }

  async save(sitting: TableSitting): Promise<void> {
    const updated = await this.db
      .update(tableSittings)
      .set(toRow(sitting))
      .where(eq(tableSittings.id, sitting.id))
      .returning({ id: tableSittings.id });
    if (updated.length === 0) {
      throw new TableSittingNotFoundError();
    }

    await this.db.delete(tableSittingPayments).where(eq(tableSittingPayments.sittingId, sitting.id));
    if (sitting.payment !== null) {
      const payment = toPaymentRow(sitting.id, sitting.payment);
      await this.db.insert(tableSittingPayments).values({
        sittingId: sitting.id,
        paymentId: payment.paymentId,
        method: payment.method,
        amount: payment.amount,
        currency: payment.currency,
        tenderedAmount: payment.tenderedAmount,
        cardLast4: payment.cardLast4,
        payerReference: payment.payerReference,
        reference: payment.reference,
        paidAt: payment.paidAt,
      });
    }
  }

  async findById(id: string): Promise<TableSitting | null> {
    const rows = await this.db.select().from(tableSittings).where(eq(tableSittings.id, id));
    const stored = rows[0];
    return stored === undefined ? null : this.hydrate(stored);
  }

  async findOpenByTableId(tableId: string): Promise<TableSitting | null> {
    const rows = await this.db
      .select()
      .from(tableSittings)
      .where(eq(tableSittings.tableId, tableId));
    const open = rows.find((row) => row.status === 'OPEN');
    return open === undefined ? null : this.hydrate(open);
  }

  private async hydrate(row: typeof tableSittings.$inferSelect): Promise<TableSitting> {
    const payments = await this.db
      .select()
      .from(tableSittingPayments)
      .where(eq(tableSittingPayments.sittingId, row.id));
    const paymentRow = payments[0];
    return TableSitting.restore({
      id: row.id,
      tableId: row.tableId,
      status: row.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
      billingMode: row.billingMode === 'separate' ? 'separate' : 'combined',
      discount: toDiscount(row),
      tip: toTip(row),
      payment: paymentRow === undefined ? null : toSittingPayment(paymentRow),
    });
  }
}

function toRow(sitting: TableSitting) {
  return {
    id: sitting.id,
    tableId: sitting.tableId,
    status: sitting.status,
    billingMode: sitting.billingMode satisfies BillingMode,
    ...toDiscountColumns(sitting.discount),
    ...toTipColumns(sitting.tip),
  };
}

function toSittingPayment(row: typeof tableSittingPayments.$inferSelect): Payment {
  let details: PaymentDetails;
  if (row.method === 'cash') {
    details = PaymentDetails.cash(Money.of(row.tenderedAmount ?? row.amount, row.currency));
  } else if (row.method === 'card') {
    details = PaymentDetails.card(row.cardLast4);
  } else {
    details = PaymentDetails.digitalGateway(row.payerReference);
  }
  return Payment.restore({
    id: row.paymentId,
    amount: Money.of(row.amount, row.currency),
    details,
    reference: row.reference,
    paidAt: row.paidAt,
  });
}

function isUnique(error: unknown): boolean {
  if (error instanceof postgres.PostgresError) {
    return error.code === '23505';
  }
  if (typeof error === 'object' && error !== null && 'cause' in error) {
    return isUnique(error.cause);
  }
  return false;
}

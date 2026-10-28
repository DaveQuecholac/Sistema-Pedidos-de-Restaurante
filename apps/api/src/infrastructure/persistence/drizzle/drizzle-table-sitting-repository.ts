import { eq } from 'drizzle-orm';
import type { PaymentReceiptQuery } from '../../../application/ports/payment-receipt-query';
import type { TableSittingRepository } from '../../../application/ports/table-sitting-repository';
import {
  TableSittingAlreadyExistsError,
  TableSittingNotFoundError,
} from '../../../application/table/in-memory-table-sitting-repository';
import { TableSitting, type BillingMode } from '../../../domain/table/table-sitting';
import type { AppDatabase } from './client';
import {
  paymentColumnsForSave,
  recordedPayment,
  toDiscount,
  toDiscountColumns,
  toTip,
  toTipColumns,
} from './order.mapper';
import { tableSittings } from './schema/order';
import postgres from 'postgres';

export class DrizzleTableSittingRepository implements TableSittingRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly receipts: PaymentReceiptQuery,
  ) {}

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
    const paymentColumns = await paymentColumnsForSave(this.receipts, sitting.id, sitting.payment);
    const updated = await this.db
      .update(tableSittings)
      .set({ ...toRow(sitting), ...paymentColumns })
      .where(eq(tableSittings.id, sitting.id))
      .returning({ id: tableSittings.id });
    if (updated.length === 0) {
      throw new TableSittingNotFoundError();
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
    const payment = await recordedPayment(
      this.receipts,
      row.id,
      row.paymentId,
      row.paymentReference,
    );
    return TableSitting.restore({
      id: row.id,
      tableId: row.tableId,
      status: row.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
      billingMode: row.billingMode === 'separate' ? 'separate' : 'combined',
      discount: toDiscount(row),
      tip: toTip(row),
      payment,
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
    paymentId: sitting.payment === null ? null : sitting.payment.id,
    paymentReference: sitting.payment === null ? null : sitting.payment.reference,
  };
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

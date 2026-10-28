import { and, eq, type ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import { PaymentAlreadyExistsError } from '../../../application/payment/payment.errors';
import type { PaymentRepository } from '../../../application/ports/payment-repository';
import type { Payment } from '../../../domain/payment/payment';
import type { PaymentsDatabase } from './client';
import { toPayment, toPaymentRow } from './payment.mapper';
import * as schema from './schema/payment';
import { payments } from './schema/payment';

type PaymentSchema = typeof schema;

/** Root client from `createPaymentsDatabase`, or the `tx` of a Drizzle transaction. */
export type PaymentDatabase =
  | PaymentsDatabase
  | PgTransaction<PostgresJsQueryResultHKT, PaymentSchema, ExtractTablesWithRelations<PaymentSchema>>;

const APPROVED_SUBJECT_CONSTRAINT = 'payments_one_approved_per_subject';

export class DrizzlePaymentRepository implements PaymentRepository {
  constructor(private readonly db: PaymentDatabase) {}

  async findApprovedBySubjectId(subjectId: string): Promise<Payment | null> {
    const rows = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.subjectId, subjectId), eq(payments.status, 'approved')))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toPayment(row);
  }

  async findByReference(reference: string): Promise<Payment | null> {
    const rows = await this.db.select().from(payments).where(eq(payments.reference, reference)).limit(1);
    const row = rows[0];
    return row === undefined ? null : toPayment(row);
  }

  async insert(payment: Payment): Promise<void> {
    try {
      await this.db.insert(payments).values(toPaymentRow(payment));
    } catch (error) {
      if (isApprovedSubjectConflict(error)) {
        throw new PaymentAlreadyExistsError();
      }
      throw error;
    }
  }

  async markVoided(paymentId: string): Promise<void> {
    await this.db.update(payments).set({ status: 'voided' }).where(eq(payments.paymentId, paymentId));
  }
}

function isApprovedSubjectConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: string; constraint_name?: string };
  return candidate.code === '23505' && candidate.constraint_name === APPROVED_SUBJECT_CONSTRAINT;
}

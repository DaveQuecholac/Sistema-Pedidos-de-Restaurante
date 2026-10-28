import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core';

/** One charge per subject while it stays approved. A voided row does not block the next charge. */
export const payments = pgTable(
  'payments',
  {
    paymentId: text('payment_id').primaryKey(),
    subjectId: text('subject_id').notNull(),
    method: text('method').notNull(),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull(),
    tenderedAmount: integer('tendered_amount'),
    cardLast4: text('card_last4'),
    payerReference: text('payer_reference'),
    reference: text('reference').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull(),
    status: text('status').notNull(),
  },
  (table) => [
    unique('payments_reference_unique').on(table.reference),
    uniqueIndex('payments_one_approved_per_subject')
      .on(table.subjectId)
      .where(sql`${table.status} = 'approved'`),
    check('payments_method', sql`${table.method} in ('cash', 'card', 'digitalGateway')`),
    check('payments_amount_gte_0', sql`${table.amount} >= 0`),
    check('payments_currency_len_3', sql`length(${table.currency}) = 3`),
    check('payments_reference_len', sql`length(btrim(${table.reference})) between 1 and 64`),
    check('payments_status', sql`${table.status} in ('approved', 'voided')`),
    check(
      'payments_shape',
      sql`(
        (
          ${table.method} = 'cash'
          and ${table.tenderedAmount} is not null
          and ${table.tenderedAmount} >= ${table.amount}
          and ${table.cardLast4} is null
          and ${table.payerReference} is null
        )
        or
        (
          ${table.method} = 'card'
          and ${table.cardLast4} is not null
          and ${table.cardLast4} ~ '^[0-9]{4}$'
          and ${table.tenderedAmount} is null
          and ${table.payerReference} is null
        )
        or
        (
          ${table.method} = 'digitalGateway'
          and ${table.payerReference} is not null
          and length(btrim(${table.payerReference})) between 3 and 64
          and ${table.tenderedAmount} is null
          and ${table.cardLast4} is null
        )
      )`,
    ),
  ],
);

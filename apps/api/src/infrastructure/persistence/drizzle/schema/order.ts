import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { menuItems } from './menu';

export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    tableId: text('table_id'),
    externalOrderId: text('external_order_id'),
    status: text('status').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
    version: integer('version').notNull().default(0),
    discountKind: text('discount_kind'),
    discountBasisPoints: integer('discount_basis_points'),
    discountAmount: integer('discount_amount'),
    discountCurrency: text('discount_currency'),
    tipKind: text('tip_kind'),
    tipBasisPoints: integer('tip_basis_points'),
    tipAmount: integer('tip_amount'),
    tipCurrency: text('tip_currency'),
  },
  (table) => [
    check(
      'orders_table_id_len',
      sql`${table.tableId} is null or (length(btrim(${table.tableId})) between 1 and 40)`,
    ),
    check(
      'orders_external_order_id_len',
      sql`${table.externalOrderId} is null or (length(btrim(${table.externalOrderId})) between 1 and 64)`,
    ),
    check(
      'orders_origin_exactly_one',
      sql`(${table.tableId} is null) <> (${table.externalOrderId} is null)`,
    ),
    check(
      'orders_status',
      sql`${table.status} in ('OPEN', 'SENT_TO_KITCHEN', 'IN_KITCHEN', 'READY', 'CLOSED', 'CANCELLED')`,
    ),
    check('orders_version_gte_0', sql`${table.version} >= 0`),
    check(
      'orders_discount_kind',
      sql`${table.discountKind} is null or ${table.discountKind} in ('percentage', 'fixedAmount')`,
    ),
    check(
      'orders_discount_shape',
      sql`(
        (
          ${table.discountKind} is null
          and ${table.discountBasisPoints} is null
          and ${table.discountAmount} is null
          and ${table.discountCurrency} is null
        )
        or
        (
          ${table.discountKind} = 'percentage'
          and ${table.discountBasisPoints} between 1 and 10000
          and ${table.discountAmount} is null
          and ${table.discountCurrency} is null
        )
        or
        (
          ${table.discountKind} = 'fixedAmount'
          and ${table.discountBasisPoints} is null
          and ${table.discountAmount} is not null
          and ${table.discountAmount} > 0
          and ${table.discountCurrency} is not null
          and length(${table.discountCurrency}) = 3
        )
      )`,
    ),
    check(
      'orders_tip_kind',
      sql`${table.tipKind} is null or ${table.tipKind} in ('percentage', 'fixedAmount')`,
    ),
    check(
      'orders_tip_shape',
      sql`(
        (
          ${table.tipKind} is null
          and ${table.tipBasisPoints} is null
          and ${table.tipAmount} is null
          and ${table.tipCurrency} is null
        )
        or
        (
          ${table.tipKind} = 'percentage'
          and ${table.tipBasisPoints} between 1 and 10000
          and ${table.tipAmount} is null
          and ${table.tipCurrency} is null
        )
        or
        (
          ${table.tipKind} = 'fixedAmount'
          and ${table.tipBasisPoints} is null
          and ${table.tipAmount} is not null
          and ${table.tipAmount} > 0
          and ${table.tipCurrency} is not null
          and length(${table.tipCurrency}) = 3
        )
      )`,
    ),
    unique('orders_external_order_id_unique').on(table.externalOrderId),
    index('orders_status_opened_at_idx').on(table.status, table.openedAt),
  ],
);

export const orderLines = pgTable(
  'order_lines',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    menuItemId: text('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    unitPriceAmount: integer('unit_price_amount').notNull(),
    unitPriceCurrency: text('unit_price_currency').notNull(),
    taxBasisPoints: integer('tax_basis_points').notNull(),
    quantity: integer('quantity').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    check('order_lines_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check('order_lines_unit_price_amount_gte_0', sql`${table.unitPriceAmount} >= 0`),
    check('order_lines_unit_price_currency_len_3', sql`length(${table.unitPriceCurrency}) = 3`),
    check('order_lines_tax_basis_points_gte_0', sql`${table.taxBasisPoints} >= 0`),
    check('order_lines_quantity_range', sql`${table.quantity} between 1 and 99`),
    check('order_lines_position_gte_0', sql`${table.position} >= 0`),
    unique('order_lines_order_id_position').on(table.orderId, table.position),
  ],
);

export const orderLineModifiers = pgTable(
  'order_line_modifiers',
  {
    orderLineId: text('order_line_id')
      .notNull()
      .references(() => orderLines.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    modifierId: text('modifier_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    priceAmount: integer('price_amount'),
    priceCurrency: text('price_currency'),
  },
  (table) => [
    primaryKey({
      name: 'order_line_modifiers_pkey',
      columns: [table.orderLineId, table.position],
    }),
    check('order_line_modifiers_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check('order_line_modifiers_kind', sql`${table.kind} in ('extra', 'exclusion')`),
    check('order_line_modifiers_position_gte_0', sql`${table.position} >= 0`),
    check(
      'order_line_modifiers_price_by_kind',
      sql`(
        (${table.kind} = 'extra' and ${table.priceAmount} >= 0 and ${table.priceCurrency} is not null)
        or
        (${table.kind} = 'exclusion' and ${table.priceAmount} is null and ${table.priceCurrency} is null)
      )`,
    ),
  ],
);

/** One payment per order. Change is derived in the domain and is not stored. */
export const orderPayments = pgTable(
  'order_payments',
  {
    orderId: text('order_id')
      .primaryKey()
      .references(() => orders.id, { onDelete: 'cascade' }),
    paymentId: text('payment_id').notNull(),
    method: text('method').notNull(),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull(),
    tenderedAmount: integer('tendered_amount'),
    cardLast4: text('card_last4'),
    payerReference: text('payer_reference'),
    reference: text('reference').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('order_payments_payment_id_unique').on(table.paymentId),
    check(
      'order_payments_method',
      sql`${table.method} in ('cash', 'card', 'digitalGateway')`,
    ),
    check('order_payments_amount_gte_0', sql`${table.amount} >= 0`),
    check('order_payments_currency_len_3', sql`length(${table.currency}) = 3`),
    check(
      'order_payments_reference_len',
      sql`length(btrim(${table.reference})) between 1 and 64`,
    ),
    check(
      'order_payments_shape',
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

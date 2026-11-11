import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text } from 'drizzle-orm/pg-core';

/** Dining-table catalog (RF2). Occupancy is derived from orders, not a column. */
export const tables = pgTable(
  'tables',
  {
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    zone: text('zone').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    check(
      'tables_id_len',
      sql`length(btrim(${table.id})) between 1 and 40`,
    ),
    check('tables_label_not_blank', sql`length(btrim(${table.label})) > 0`),
    check('tables_zone_not_blank', sql`length(btrim(${table.zone})) > 0`),
  ],
);

import { and, asc, eq, inArray, type ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  ExternalOrderIdInUseError,
  OrderAlreadyExistsError,
  OrderConcurrencyError,
  OrderNotFoundError,
} from '../../../application/order/order-repository.errors';
import type { OrderRepository } from '../../../application/ports/order-repository';
import type { LineItem } from '../../../domain/order/line-item';
import type { Order } from '../../../domain/order/order';
import type { OrderStatus } from '../../../domain/order/order-status';
import type { AppDatabase } from './client';
import {
  toOrder,
  type OrderLineModifierRow,
  type OrderLineRow,
  type OrderRow,
} from './order.mapper';
import * as schema from './schema/menu';
import { orderLineModifiers, orderLines, orders } from './schema/order';

type MenuSchema = typeof schema;

/** Root client from `createDatabase`, or the `tx` passed to a Drizzle transaction callback. */
export type OrderDatabase =
  | AppDatabase
  | PgTransaction<PostgresJsQueryResultHKT, MenuSchema, ExtractTablesWithRelations<MenuSchema>>;

export class DrizzleOrderRepository implements OrderRepository {
  constructor(private readonly db: OrderDatabase) {}

  async add(order: Order): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(orders).values(orderRow(order));
        await insertLines(tx, order);
      });
    } catch (error) {
      if (isConstraintViolation(error, 'orders_pkey')) {
        throw new OrderAlreadyExistsError();
      }
      if (isConstraintViolation(error, 'orders_external_order_id_unique')) {
        throw new ExternalOrderIdInUseError();
      }
      throw error;
    }
  }

  async save(order: Order): Promise<void> {
    await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(orders)
        .set({
          status: order.status,
          version: order.version + 1,
        })
        .where(and(eq(orders.id, order.id), eq(orders.version, order.version)))
        .returning({ id: orders.id });

      if (updated.length === 0) {
        const existing = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.id, order.id));
        if (existing.length === 0) {
          throw new OrderNotFoundError();
        }
        throw new OrderConcurrencyError();
      }

      await tx.delete(orderLines).where(eq(orderLines.orderId, order.id));
      await insertLines(tx, order);
    });
  }

  async findById(id: string): Promise<Order | null> {
    const rows = await this.db.select().from(orders).where(eq(orders.id, id));
    const stored = rows[0];
    if (stored === undefined) {
      return null;
    }

    const hydrated = await this.hydrate([stored]);
    return hydrated[0] ?? null;
  }

  async findByExternalOrderId(externalOrderId: string): Promise<Order | null> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(eq(orders.externalOrderId, externalOrderId));
    const stored = rows[0];
    if (stored === undefined) {
      return null;
    }

    const hydrated = await this.hydrate([stored]);
    return hydrated[0] ?? null;
  }

  async list(filter: { statuses: readonly OrderStatus[] | null }): Promise<Order[]> {
    const rows =
      filter.statuses === null
        ? await this.db
            .select()
            .from(orders)
            .orderBy(asc(orders.openedAt), asc(orders.id))
        : await this.db
            .select()
            .from(orders)
            .where(inArray(orders.status, filter.statuses))
            .orderBy(asc(orders.openedAt), asc(orders.id));

    return this.hydrate(rows);
  }

  private async hydrate(orderRows: readonly OrderRow[]): Promise<Order[]> {
    if (orderRows.length === 0) {
      return [];
    }

    const orderIds = orderRows.map((row) => row.id);
    const lineRows = await this.db
      .select()
      .from(orderLines)
      .where(inArray(orderLines.orderId, orderIds))
      .orderBy(asc(orderLines.position), asc(orderLines.id));

    const lineIds = lineRows.map((row) => row.id);
    const modifierRows =
      lineIds.length === 0
        ? []
        : await this.db
            .select()
            .from(orderLineModifiers)
            .where(inArray(orderLineModifiers.orderLineId, lineIds))
            .orderBy(asc(orderLineModifiers.position));

    const linesByOrder = groupByOrderId(lineRows);
    const modifiersByLine = groupByLineId(modifierRows);

    return orderRows.map((row) => {
      const lines = linesByOrder.get(row.id) ?? [];
      const modifiers = lines.flatMap((line) => modifiersByLine.get(line.id) ?? []);
      return toOrder(row, lines, modifiers);
    });
  }
}

async function insertLines(tx: OrderDatabase, order: Order): Promise<void> {
  const lines = order.lines;
  if (lines.length === 0) {
    return;
  }

  await tx.insert(orderLines).values(lines.map((line, position) => lineRow(order.id, line, position)));

  const modifierValues = lines.flatMap((line) =>
    line.modifiers.map((modifier, position) => ({
      orderLineId: line.id,
      position,
      modifierId: modifier.modifierId,
      name: modifier.name,
      kind: modifier.kind,
      priceAmount: modifier.price === null ? null : modifier.price.amount,
      priceCurrency: modifier.price === null ? null : modifier.price.currency,
    })),
  );

  if (modifierValues.length > 0) {
    await tx.insert(orderLineModifiers).values(modifierValues);
  }
}

function orderRow(order: Order): OrderRow {
  return {
    id: order.id,
    tableId: order.origin.tableId,
    externalOrderId: order.origin.externalOrderId,
    status: order.status,
    openedAt: order.openedAt,
    version: order.version,
  };
}

function lineRow(orderId: string, line: LineItem, position: number) {
  return {
    id: line.id,
    orderId,
    menuItemId: line.menuItemId,
    name: line.name,
    unitPriceAmount: line.unitPrice.amount,
    unitPriceCurrency: line.unitPrice.currency,
    taxBasisPoints: line.applicableTax.basisPoints,
    quantity: line.quantity.amount,
    position,
  };
}

function groupByOrderId(rows: readonly OrderLineRow[]): Map<string, OrderLineRow[]> {
  const grouped = new Map<string, OrderLineRow[]>();

  for (const row of rows) {
    const current = grouped.get(row.orderId);
    if (current === undefined) {
      grouped.set(row.orderId, [row]);
    } else {
      current.push(row);
    }
  }

  return grouped;
}

function groupByLineId(rows: readonly OrderLineModifierRow[]): Map<string, OrderLineModifierRow[]> {
  const grouped = new Map<string, OrderLineModifierRow[]>();

  for (const row of rows) {
    const current = grouped.get(row.orderLineId);
    if (current === undefined) {
      grouped.set(row.orderLineId, [row]);
    } else {
      current.push(row);
    }
  }

  return grouped;
}

function isConstraintViolation(error: unknown, constraint: string): boolean {
  if (error instanceof postgres.PostgresError) {
    return error.code === '23505' && error.constraint_name === constraint;
  }

  if (typeof error === 'object' && error !== null && 'cause' in error) {
    return isConstraintViolation(error.cause, constraint);
  }

  return false;
}

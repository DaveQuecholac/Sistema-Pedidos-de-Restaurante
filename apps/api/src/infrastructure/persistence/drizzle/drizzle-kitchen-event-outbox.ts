import { and, asc, eq, isNull } from 'drizzle-orm';
import type {
  KitchenEventOutbox,
  PendingKitchenEvent,
} from '../../../application/ports/kitchen-event-outbox';
import type { OrderDatabase } from './drizzle-order-repository';
import { orderOutbox } from './schema/order';

/** Reads and marks `order_outbox`. Does not update the order. */
export class DrizzleKitchenEventOutbox implements KitchenEventOutbox {
  constructor(private readonly db: OrderDatabase) {}

  async listPending(): Promise<readonly PendingKitchenEvent[]> {
    const rows = await this.db
      .select()
      .from(orderOutbox)
      .where(isNull(orderOutbox.publishedAt))
      .orderBy(asc(orderOutbox.occurredAt), asc(orderOutbox.id));

    return rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      eventType: 'OrderSentToKitchen',
      occurredAt: row.occurredAt,
    }));
  }

  async markPublished(id: string, publishedAt: Date): Promise<void> {
    await this.db
      .update(orderOutbox)
      .set({ publishedAt })
      .where(and(eq(orderOutbox.id, id), isNull(orderOutbox.publishedAt)));
  }
}

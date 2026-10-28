import { describe, expect, it } from 'vitest';
import type {
  KitchenEventOutbox,
  PendingKitchenEvent,
} from '../ports/kitchen-event-outbox';
import type { KitchenEvent, KitchenEventPublisher } from '../ports/kitchen-event-publisher';
import { PublishPendingKitchenEvents } from './publish-pending-kitchen-events';

const PUBLISHED_AT = new Date('2026-10-28T22:00:05.000Z');

describe('PublishPendingKitchenEvents', () => {
  it('marks published_at and does not change the order status (K5-1)', async () => {
    const occurredAt = new Date('2026-10-28T22:00:00.000Z');
    const outbox = new MemoryKitchenOutbox([
      pending('event-1', 'order-1', occurredAt, 'SENT_TO_KITCHEN'),
    ]);
    const publisher = new RecordingPublisher();
    const useCase = new PublishPendingKitchenEvents(outbox, publisher, () => PUBLISHED_AT);

    await useCase.execute();

    expect(publisher.events).toEqual([
      { orderId: 'order-1', eventType: 'OrderSentToKitchen', occurredAt },
    ]);
    expect(outbox.publishedAtOf('event-1')).toEqual(PUBLISHED_AT);
    expect(outbox.orderStatus('order-1')).toBe('SENT_TO_KITCHEN');
  });

  it('leaves a failed notice unpublished and publishes the next one (K5-2)', async () => {
    const earlier = new Date('2026-10-28T22:00:00.000Z');
    const later = new Date('2026-10-28T22:00:02.000Z');
    const outbox = new MemoryKitchenOutbox([
      pending('event-later', 'order-2', later, 'SENT_TO_KITCHEN'),
      pending('event-earlier', 'order-1', earlier, 'SENT_TO_KITCHEN'),
    ]);
    const publisher = new FailFirstPublisher();
    const useCase = new PublishPendingKitchenEvents(outbox, publisher, () => PUBLISHED_AT);

    await useCase.execute();

    expect(publisher.events).toEqual([
      { orderId: 'order-2', eventType: 'OrderSentToKitchen', occurredAt: later },
    ]);
    expect(outbox.publishedAtOf('event-earlier')).toBeNull();
    expect(outbox.publishedAtOf('event-later')).toEqual(PUBLISHED_AT);
    expect(outbox.orderStatus('order-1')).toBe('SENT_TO_KITCHEN');
    expect(outbox.orderStatus('order-2')).toBe('SENT_TO_KITCHEN');
  });
});

type StoredNotice = PendingKitchenEvent & {
  readonly orderStatus: string;
};

class MemoryKitchenOutbox implements KitchenEventOutbox {
  private readonly publishedAt = new Map<string, Date>();

  constructor(private readonly rows: readonly StoredNotice[]) {}

  listPending(): Promise<readonly PendingKitchenEvent[]> {
    const pending = this.rows
      .filter((row) => !this.publishedAt.has(row.id))
      .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
      .map(({ id, orderId, eventType, occurredAt }) => ({
        id,
        orderId,
        eventType,
        occurredAt,
      }));
    return Promise.resolve(pending);
  }

  markPublished(id: string, publishedAt: Date): Promise<void> {
    this.publishedAt.set(id, publishedAt);
    return Promise.resolve();
  }

  publishedAtOf(id: string): Date | null {
    return this.publishedAt.get(id) ?? null;
  }

  orderStatus(orderId: string): string | undefined {
    return this.rows.find((row) => row.orderId === orderId)?.orderStatus;
  }
}

class RecordingPublisher implements KitchenEventPublisher {
  readonly events: KitchenEvent[] = [];

  publish(event: KitchenEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

class FailFirstPublisher implements KitchenEventPublisher {
  readonly events: KitchenEvent[] = [];
  private attempts = 0;

  publish(event: KitchenEvent): Promise<void> {
    this.attempts += 1;
    if (this.attempts === 1) {
      return Promise.reject(new Error('publisher down'));
    }
    this.events.push(event);
    return Promise.resolve();
  }
}

function pending(
  id: string,
  orderId: string,
  occurredAt: Date,
  orderStatus: string,
): StoredNotice {
  return {
    id,
    orderId,
    eventType: 'OrderSentToKitchen',
    occurredAt,
    orderStatus,
  };
}

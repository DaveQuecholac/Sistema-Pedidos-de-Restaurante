import type { KitchenEventOutbox } from '../ports/kitchen-event-outbox';
import type { KitchenEventPublisher } from '../ports/kitchen-event-publisher';

/** Marks pending kitchen notices as published. Does not read or change orders. */
export class PublishPendingKitchenEvents {
  constructor(
    private readonly outbox: KitchenEventOutbox,
    private readonly publisher: KitchenEventPublisher,
    private readonly now: () => Date,
  ) {}

  async execute(): Promise<void> {
    const pending = await this.outbox.listPending();

    for (const event of pending) {
      try {
        await this.publisher.publish({
          orderId: event.orderId,
          eventType: event.eventType,
          occurredAt: event.occurredAt,
        });
      } catch {
        continue;
      }

      await this.outbox.markPublished(event.id, this.now());
    }
  }
}

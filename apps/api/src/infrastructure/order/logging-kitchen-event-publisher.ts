import type {
  KitchenEvent,
  KitchenEventPublisher,
} from '../../application/ports/kitchen-event-publisher';

/** Writes the kitchen notice to the process log. Does not call another service. */
export class LoggingKitchenEventPublisher implements KitchenEventPublisher {
  constructor(private readonly write: (line: string) => void = (line) => console.info(line)) {}

  async publish(event: KitchenEvent): Promise<void> {
    this.write(
      `OrderSentToKitchen orderId=${event.orderId} eventType=${event.eventType} occurredAt=${event.occurredAt.toISOString()}`,
    );
  }
}

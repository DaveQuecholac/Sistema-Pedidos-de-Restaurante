import { describe, expect, it } from 'vitest';
import { LoggingKitchenEventPublisher } from './logging-kitchen-event-publisher';

describe('LoggingKitchenEventPublisher', () => {
  it('writes the kitchen notice and does not throw', async () => {
    const lines: string[] = [];
    const publisher = new LoggingKitchenEventPublisher((line) => {
      lines.push(line);
    });
    const occurredAt = new Date('2026-10-28T22:00:00.000Z');

    await publisher.publish({
      orderId: 'order-1',
      eventType: 'OrderSentToKitchen',
      occurredAt,
    });

    expect(lines).toEqual([
      'OrderSentToKitchen orderId=order-1 eventType=OrderSentToKitchen occurredAt=2026-10-28T22:00:00.000Z',
    ]);
  });
});

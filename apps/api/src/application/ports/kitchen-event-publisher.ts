export type KitchenEvent = {
  readonly orderId: string;
  readonly eventType: 'OrderSentToKitchen';
  readonly occurredAt: Date;
};

/** Driven port that announces an order already sent to the kitchen. */
export interface KitchenEventPublisher {
  publish(event: KitchenEvent): Promise<void>;
}

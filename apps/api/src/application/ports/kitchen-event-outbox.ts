import type { KitchenEvent } from './kitchen-event-publisher';

export type PendingKitchenEvent = KitchenEvent & {
  readonly id: string;
};

/** Pending kitchen notices. `listPending` is ordered by `occurredAt`. */
export interface KitchenEventOutbox {
  listPending(): Promise<readonly PendingKitchenEvent[]>;
  markPublished(id: string, publishedAt: Date): Promise<void>;
}

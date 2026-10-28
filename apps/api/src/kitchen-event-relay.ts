export const DEFAULT_KITCHEN_EVENT_RELAY_INTERVAL_MS = 5_000;

/** Reads the relay interval at startup. Blank means a few seconds. */
export function readKitchenEventRelayIntervalMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_KITCHEN_EVENT_RELAY_INTERVAL_MS;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('KITCHEN_EVENT_RELAY_INTERVAL_MS must be a positive integer');
  }

  return parsed;
}

/** Schedules the relay. Returns before the first run, so HTTP does not wait for it. */
export function startKitchenEventRelay(
  relay: { execute(): Promise<void> },
  intervalMs: number,
  onError: (error: unknown) => void,
  schedule: (tick: () => void, intervalMs: number) => void = (tick, ms) => {
    setInterval(tick, ms);
  },
): void {
  let running = false;

  schedule(() => {
    if (running) {
      return;
    }

    running = true;
    void relay
      .execute()
      .catch(onError)
      .finally(() => {
        running = false;
      });
  }, intervalMs);
}

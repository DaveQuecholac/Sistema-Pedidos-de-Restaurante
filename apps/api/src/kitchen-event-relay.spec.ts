import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KITCHEN_EVENT_RELAY_INTERVAL_MS,
  readKitchenEventRelayIntervalMs,
  startKitchenEventRelay,
} from './kitchen-event-relay';

describe('kitchen event relay interval', () => {
  it('uses a few seconds when the env value is missing', () => {
    expect(readKitchenEventRelayIntervalMs(undefined)).toBe(
      DEFAULT_KITCHEN_EVENT_RELAY_INTERVAL_MS,
    );
    expect(readKitchenEventRelayIntervalMs('  ')).toBe(DEFAULT_KITCHEN_EVENT_RELAY_INTERVAL_MS);
  });

  it('reads a positive integer from the env value', () => {
    expect(readKitchenEventRelayIntervalMs('2500')).toBe(2500);
  });

  it('rejects a value that is not a positive integer', () => {
    expect(() => readKitchenEventRelayIntervalMs('0')).toThrow(
      'KITCHEN_EVENT_RELAY_INTERVAL_MS must be a positive integer',
    );
    expect(() => readKitchenEventRelayIntervalMs('1.5')).toThrow(
      'KITCHEN_EVENT_RELAY_INTERVAL_MS must be a positive integer',
    );
    expect(() => readKitchenEventRelayIntervalMs('soon')).toThrow(
      'KITCHEN_EVENT_RELAY_INTERVAL_MS must be a positive integer',
    );
  });

  it('returns before the relay runs (K5 interval)', () => {
    let started = 0;
    let tick: (() => void) | undefined;

    startKitchenEventRelay(
      {
        execute: async () => {
          started += 1;
        },
      },
      5_000,
      () => {},
      (callback, intervalMs) => {
        tick = callback;
        expect(intervalMs).toBe(5_000);
      },
    );

    expect(started).toBe(0);
    expect(tick).toBeTypeOf('function');
  });

  it('skips a tick while the previous relay is still running', async () => {
    let started = 0;
    let release: () => void = () => {};
    let tick: () => void = () => {};

    startKitchenEventRelay(
      {
        execute: () => {
          started += 1;
          return new Promise<void>((resolve) => {
            release = resolve;
          });
        },
      },
      5_000,
      () => {},
      (callback) => {
        tick = callback;
      },
    );

    tick();
    tick();
    expect(started).toBe(1);

    release();
    await flush();
    tick();
    expect(started).toBe(2);
  });

  it('keeps scheduling after a relay failure', async () => {
    const errors: unknown[] = [];
    let started = 0;
    let tick: () => void = () => {};

    startKitchenEventRelay(
      {
        execute: async () => {
          started += 1;
          throw new Error('db down');
        },
      },
      5_000,
      (error) => {
        errors.push(error);
      },
      (callback) => {
        tick = callback;
      },
    );

    tick();
    await flush();
    expect(errors).toHaveLength(1);
    expect(started).toBe(1);

    tick();
    await flush();
    expect(started).toBe(2);
  });
});

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

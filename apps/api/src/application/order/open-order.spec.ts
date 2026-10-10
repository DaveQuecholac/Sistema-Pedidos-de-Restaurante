import { describe, expect, it } from 'vitest';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import {
  InvalidOrderOriginError,
  InvalidTableIdError,
} from '../../domain/order/order.errors';
import { LineItem } from '../../domain/order/line-item';
import { Quantity } from '../../domain/order/quantity';
import { Table } from '../../domain/table/table';
import { InMemoryTableRepository } from '../table/in-memory-table-repository';
import { salonTables } from '../table/salon-tables';
import {
  TableAlreadyHasActiveOrderError,
  TableInactiveError,
  TableNotFoundError,
} from '../table/table-repository.errors';
import { InMemoryOrderRepository } from './in-memory-order-repository';
import { OpenOrder } from './open-order';
import { ExternalOrderIdInUseError } from './order-repository.errors';
import {
  FIXED_NOW,
  idsOf,
  tacosDish,
  watchOrders,
} from './order-test-fixtures';

describe('OpenOrder', () => {
  it('opens a table order with generateId and now (C1)', async () => {
    const seen = watchOrders(new InMemoryOrderRepository());
    const useCase = new OpenOrder(
      seen.orders,
      salonTables('5'),
      idsOf('order-1'),
      () => FIXED_NOW,
    );

    const order = await useCase.execute({ tableId: '5' });

    expect(seen.calls.add).toBe(1);
    expect(order.id).toBe('order-1');
    expect(order.status).toBe('OPEN');
    expect(order.origin.tableId).toBe('5');
    expect(order.openedAt).toBe(FIXED_NOW);
    expect(order.lines).toEqual([]);
  });

  it('opens an external order without touching tables (C2)', async () => {
    const seen = watchOrders(new InMemoryOrderRepository());
    const tables = new InMemoryTableRepository();
    const useCase = new OpenOrder(seen.orders, tables, idsOf('order-1'), () => FIXED_NOW);

    const order = await useCase.execute({ externalOrderId: 'UBER-1' });

    expect(seen.calls.add).toBe(1);
    expect(order.origin.externalOrderId).toBe('UBER-1');
    expect(order.origin.tableId).toBeNull();
    expect(await tables.list()).toEqual([]);
  });

  it('rejects a second active order on the same table (C3)', async () => {
    const repo = new InMemoryOrderRepository();
    await repo.add(
      Order.open({ id: 'order-a', origin: OrderOrigin.table('5'), openedAt: FIXED_NOW }),
    );
    await repo.add(
      Order.restore({
        id: 'order-b',
        origin: OrderOrigin.table('5'),
        status: 'IN_KITCHEN',
        openedAt: FIXED_NOW,
        lines: [
          LineItem.capture({
            id: 'line-1',
            menuItem: tacosDish(),
            quantity: Quantity.of(1),
            modifierIds: [],
          }),
        ],
        version: 1,
        discount: null,
        tip: null,
        payment: null,
      }),
    );

    const seen = watchOrders(repo);
    const useCase = new OpenOrder(
      seen.orders,
      salonTables('5'),
      idsOf('order-c'),
      () => FIXED_NOW,
    );

    await expect(useCase.execute({ tableId: '5' })).rejects.toBeInstanceOf(
      TableAlreadyHasActiveOrderError,
    );
    expect(seen.calls.add).toBe(0);
  });

  it('rejects an external id already used by an OPEN order (C4)', async () => {
    const seen = watchOrders(new InMemoryOrderRepository());
    await seen.orders.add(
      Order.open({
        id: 'order-a',
        origin: OrderOrigin.external('UBER-1'),
        openedAt: FIXED_NOW,
      }),
    );
    const useCase = new OpenOrder(
      seen.orders,
      salonTables(),
      idsOf('order-b'),
      () => FIXED_NOW,
    );

    await expect(useCase.execute({ externalOrderId: 'UBER-1' })).rejects.toBeInstanceOf(
      ExternalOrderIdInUseError,
    );
    expect(seen.calls.add).toBe(1);
  });

  it('rejects an external id already used by a CANCELLED order (C5)', async () => {
    const seen = watchOrders(new InMemoryOrderRepository());
    await seen.orders.add(
      Order.restore({
        id: 'order-a',
        origin: OrderOrigin.external('UBER-1'),
        status: 'CANCELLED',
        openedAt: FIXED_NOW,
        lines: [],
        version: 1,
        discount: null,
        tip: null,
        payment: null,
      }),
    );
    const useCase = new OpenOrder(
      seen.orders,
      salonTables(),
      idsOf('order-b'),
      () => FIXED_NOW,
    );

    await expect(useCase.execute({ externalOrderId: 'UBER-1' })).rejects.toBeInstanceOf(
      ExternalOrderIdInUseError,
    );
    expect(seen.calls.add).toBe(1);
  });

  it('rejects both fields, neither, and a blank table id without add (C6)', async () => {
    const cases: Array<{ command: { tableId?: string; externalOrderId?: string }; error: new () => Error }> =
      [
        { command: { tableId: '5', externalOrderId: 'UBER-1' }, error: InvalidOrderOriginError },
        { command: {}, error: InvalidOrderOriginError },
        { command: { tableId: '   ' }, error: InvalidTableIdError },
      ];

    for (const entry of cases) {
      const seen = watchOrders(new InMemoryOrderRepository());
      const useCase = new OpenOrder(
        seen.orders,
        salonTables('5'),
        idsOf('order-1'),
        () => FIXED_NOW,
      );

      await expect(useCase.execute(entry.command)).rejects.toBeInstanceOf(entry.error);
      expect(seen.calls.add).toBe(0);
    }
  });

  it('rejects a missing table (C7)', async () => {
    const seen = watchOrders(new InMemoryOrderRepository());
    const useCase = new OpenOrder(
      seen.orders,
      salonTables('1'),
      idsOf('order-1'),
      () => FIXED_NOW,
    );

    await expect(useCase.execute({ tableId: '999' })).rejects.toBeInstanceOf(TableNotFoundError);
    expect(seen.calls.add).toBe(0);
  });

  it('rejects an inactive table (C8)', async () => {
    const seen = watchOrders(new InMemoryOrderRepository());
    const tables = new InMemoryTableRepository([
      Table.restore({ id: '5', label: '5', zone: 'Salón', active: false }),
    ]);
    const useCase = new OpenOrder(seen.orders, tables, idsOf('order-1'), () => FIXED_NOW);

    await expect(useCase.execute({ tableId: '5' })).rejects.toBeInstanceOf(TableInactiveError);
    expect(seen.calls.add).toBe(0);
  });

  it('allows a new table order after the previous one was cancelled (C9)', async () => {
    const orders = new InMemoryOrderRepository();
    await orders.add(
      Order.restore({
        id: 'order-old',
        origin: OrderOrigin.table('5'),
        status: 'CANCELLED',
        openedAt: FIXED_NOW,
        lines: [],
        version: 1,
        discount: null,
        tip: null,
        payment: null,
      }),
    );
    const seen = watchOrders(orders);
    const useCase = new OpenOrder(
      seen.orders,
      salonTables('5'),
      idsOf('order-new'),
      () => FIXED_NOW,
    );

    const order = await useCase.execute({ tableId: '5' });

    expect(order.id).toBe('order-new');
    expect(seen.calls.add).toBe(1);
  });
});

import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import type { OrderRepository } from '../ports/order-repository';
import type { TableCatalog } from '../ports/table-catalog';
import type { TableSittingRepository } from '../ports/table-sitting-repository';
import { InMemoryTableSittingRepository } from '../table/in-memory-table-sitting-repository';
import { TableInactiveError, TableNotFoundError } from '../table/table-repository.errors';
import { TableSitting } from '../../domain/table/table-sitting';
import { ExternalOrderIdInUseError } from './order-repository.errors';

export type OpenOrderCommand = {
  tableId?: string;
  externalOrderId?: string;
};

export class OpenOrder {
  private readonly sittings: TableSittingRepository;
  private readonly generateId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly orders: OrderRepository,
    private readonly catalog: TableCatalog,
    sittingsOrGenerateId: TableSittingRepository | (() => string),
    generateIdOrNow: (() => string) | (() => Date),
    now?: () => Date,
  ) {
    if (typeof sittingsOrGenerateId === 'function') {
      this.sittings = new InMemoryTableSittingRepository();
      this.generateId = sittingsOrGenerateId;
      this.now = generateIdOrNow as () => Date;
      return;
    }

    this.sittings = sittingsOrGenerateId;
    this.generateId = generateIdOrNow as () => string;
    this.now = now ?? (() => new Date());
  }

  async execute(command: OpenOrderCommand): Promise<Order> {
    const origin = OrderOrigin.fromInput(command);

    let sittingId: string | null = null;
    const orderId = this.generateId();
    if (origin.tableId !== null) {
      const table = await this.catalog.findById(origin.tableId);
      if (table === null) {
        throw new TableNotFoundError();
      }
      if (!table.active) {
        throw new TableInactiveError();
      }
      sittingId = await this.openSittingId(origin.tableId, orderId);
      await this.adoptLooseOrders(origin.tableId, sittingId);
    }

    if (origin.externalOrderId !== null) {
      const existing = await this.orders.findByExternalOrderId(origin.externalOrderId);
      if (existing !== null) {
        throw new ExternalOrderIdInUseError();
      }
    }

    const order = Order.open({
      id: orderId,
      origin,
      openedAt: this.now(),
    });
    const bound = sittingId === null ? order : order.bindSitting(sittingId);

    await this.orders.add(bound);
    return bound;
  }

  private async openSittingId(tableId: string, orderId: string): Promise<string> {
    const current = await this.sittings.findOpenByTableId(tableId);
    if (current !== null) {
      const active = await this.orders.listActiveByTableId(tableId);
      if (active.length > 0) {
        return current.id;
      }
      await this.sittings.save(current.closeIdle());
    }

    const created = TableSitting.open({ id: `sitting-${orderId}`, tableId });
    await this.sittings.add(created);
    return created.id;
  }

  /** Comandas opened before the table bill existed have no sitting. They join the open one. */
  private async adoptLooseOrders(tableId: string, sittingId: string): Promise<void> {
    const active = await this.orders.listActiveByTableId(tableId);
    for (const order of active) {
      if (order.sittingId === null) {
        await this.orders.save(order.bindSitting(sittingId));
      }
    }
  }
}

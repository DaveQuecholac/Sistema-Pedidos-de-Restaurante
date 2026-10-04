import type { Order } from '../../domain/order/order';
import type { OrderStatus } from '../../domain/order/order-status';

/** Driven port for orders. No SQL and no HTTP. */
export interface OrderRepository {
  add(order: Order): Promise<void>;
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
  findByExternalOrderId(externalOrderId: string): Promise<Order | null>;
  list(filter: { statuses: readonly OrderStatus[] | null }): Promise<Order[]>;
}

/** Driven port: whether a table still has an open comanda. No SQL and no gRPC. */
export interface ActiveOrdersQuery {
  hasActiveOrder(tableId: string): Promise<boolean>;
}

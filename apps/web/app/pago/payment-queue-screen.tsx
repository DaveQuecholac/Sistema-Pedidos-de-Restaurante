'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { shortOrderLabel } from '../components/app-shell/order-id-from-path';
import { orderCuentaPath } from '../components/app-shell/order-routes';
import { useShell } from '../components/app-shell/shell-context';
import tableStyles from '../components/ui/data-table.module.css';
import { EmptyState } from '../components/ui/empty-state';
import { Tabs } from '../components/ui/tabs';
import { listOrders, type OrderJson } from '../ordenes/order-api';
import { errorText, originLabel, statusLabel } from '../ordenes/order-view';
import styles from './pago.module.css';

const ACTIVE_STATUSES = ['OPEN', 'SENT_TO_KITCHEN', 'IN_KITCHEN', 'READY'] as const;

type QueueRow =
  | { kind: 'table'; tableId: string; orders: OrderJson[] }
  | { kind: 'external'; order: OrderJson };

type BoardState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; orders: OrderJson[] };

export function PaymentQueueScreen() {
  const { searchQuery, refreshToken, bumpRefresh, selection, selectOrder } = useShell();
  const [board, setBoard] = useState<BoardState>({ kind: 'loading' });
  const selectedOrderId = selection.kind === 'order' ? selection.orderId : null;

  useEffect(() => {
    let cancelled = false;
    setBoard({ kind: 'loading' });
    void listOrders([...ACTIVE_STATUSES])
      .then((orders) => {
        if (!cancelled) {
          setBoard({ kind: 'ready', orders });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setBoard({ kind: 'error', message: errorText(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const query = searchQuery.trim().toLowerCase();
  const rows = useMemo(() => {
    if (board.kind !== 'ready') {
      return [] as QueueRow[];
    }
    const tables = new Map<string, OrderJson[]>();
    const external: OrderJson[] = [];
    for (const order of board.orders) {
      if (order.tableId !== null) {
        const group = tables.get(order.tableId) ?? [];
        group.push(order);
        tables.set(order.tableId, group);
      } else if (order.status === 'READY') {
        external.push(order);
      }
    }
    const grouped: QueueRow[] = [...tables.entries()].map(([tableId, orders]) => ({
      kind: 'table',
      tableId,
      orders,
    }));
    for (const order of external) {
      grouped.push({ kind: 'external', order });
    }
    if (query === '') {
      return grouped;
    }
    return grouped.filter((row) => {
      if (row.kind === 'table') {
        return row.tableId.toLowerCase().includes(query);
      }
      const origin = originLabel(row.order).toLowerCase();
      return origin.includes(query) || row.order.id.toLowerCase().includes(query);
    });
  }, [board, query]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Pago</h1>
      </header>

      <Tabs
        label="Cola de pago"
        value="ready"
        onChange={() => undefined}
        items={[
          {
            value: 'ready',
            label: 'Por cobrar',
            count: board.kind === 'ready' ? rows.length : null,
          },
        ]}
      />

      {board.kind === 'loading' ? <p>Cargando cola de pago…</p> : null}

      {board.kind === 'error' ? (
        <div className={styles.error} role="alert">
          <p>{board.message}</p>
          <button type="button" onClick={() => bumpRefresh()}>
            Reintentar
          </button>
        </div>
      ) : null}

      {board.kind === 'ready' && rows.length === 0 ? (
        <EmptyState text="No hay cuentas por cobrar" />
      ) : null}

      {board.kind === 'ready' && rows.length > 0 ? (
        <section className={tableStyles.card} aria-label="Órdenes por cobrar">
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Origen</th>
                <th scope="col">Identificador</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                if (row.kind === 'table') {
                  const ready = row.orders.every((order) => order.status === 'READY');
                  const alone = row.orders.length === 1 ? row.orders[0] : null;
                  return (
                    <tr key={`table-${row.tableId}`}>
                      <td>Mesa {row.tableId}</td>
                      <td>Mesa</td>
                      <td>
                        {row.orders.length} {row.orders.length === 1 ? 'comanda' : 'comandas'}
                      </td>
                      <td>{ready ? 'Lista para cobrar' : 'En curso'}</td>
                      <td>
                        <Link
                          href={
                            alone !== null
                              ? orderCuentaPath(alone.id)
                              : `/pago/mesa/${encodeURIComponent(row.tableId)}`
                          }
                          className={tableStyles.actionLink}
                        >
                          {alone !== null && ready ? 'Cobrar' : 'Ver cuenta'}
                        </Link>
                      </td>
                    </tr>
                  );
                }
                const order = row.order;
                const selected = selectedOrderId === order.id;
                return (
                  <tr
                    key={order.id}
                    className={selected ? tableStyles.rowSelected : undefined}
                    tabIndex={0}
                    aria-current={selected || undefined}
                    onClick={() => selectOrder(order.id)}
                    onKeyDown={(event) => {
                      if (
                        event.target === event.currentTarget &&
                        (event.key === 'Enter' || event.key === ' ')
                      ) {
                        event.preventDefault();
                        selectOrder(order.id);
                      }
                    }}
                  >
                    <td>#{shortOrderLabel(order.id)}</td>
                    <td>Externo</td>
                    <td>{identifierLabel(order)}</td>
                    <td>{statusLabel(order.status)}</td>
                    <td>
                      <div className={tableStyles.actions}>
                        <Link
                          href={orderCuentaPath(order.id)}
                          className={tableStyles.actionLink}
                          onClick={(event) => event.stopPropagation()}
                        >
                          Cobrar
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

function identifierLabel(order: OrderJson): string {
  if (order.tableId !== null) {
    return `Mesa ${order.tableId}`;
  }
  if (order.externalOrderId !== null) {
    return order.externalOrderId;
  }
  return '—';
}
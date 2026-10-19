'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { shortOrderLabel } from '../components/app-shell/order-id-from-path';
import { orderCuentaPath, orderDetailPath } from '../components/app-shell/order-routes';
import { useShell } from '../components/app-shell/shell-context';
import tableStyles from '../components/ui/data-table.module.css';
import { EmptyState } from '../components/ui/empty-state';
import { Tabs } from '../components/ui/tabs';
import { listOrders, type OrderJson } from '../ordenes/order-api';
import { errorText, originLabel, statusLabel } from '../ordenes/order-view';
import styles from './pago.module.css';

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
    void listOrders(['READY'])
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
  const orders = useMemo(() => {
    if (board.kind !== 'ready') {
      return [];
    }
    if (query === '') {
      return board.orders;
    }
    return board.orders.filter((order) => {
      const origin = originLabel(order).toLowerCase();
      return origin.includes(query) || order.id.toLowerCase().includes(query);
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
            count: board.kind === 'ready' ? orders.length : null,
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

      {board.kind === 'ready' && orders.length === 0 ? (
        <EmptyState text="No hay órdenes listas para cobrar" />
      ) : null}

      {board.kind === 'ready' && orders.length > 0 ? (
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
              {orders.map((order) => {
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
                    <td>{order.tableId !== null ? 'Mesa' : 'Externo'}</td>
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
                        <Link
                          href={orderDetailPath(order.id)}
                          className={tableStyles.actionLink}
                          onClick={(event) => event.stopPropagation()}
                        >
                          Ver comanda
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
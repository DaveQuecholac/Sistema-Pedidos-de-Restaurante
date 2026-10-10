'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import shellStyles from '../components/app-shell/app-shell.module.css';
import { orderCuentaPath, orderDetailPath } from '../components/app-shell/order-routes';
import { useShell } from '../components/app-shell/shell-context';
import { listOrders, type OrderJson } from '../ordenes/order-api';
import { errorText, openedAtLabel, originLabel, statusLabel } from '../ordenes/order-view';
import styles from '../ordenes/orders.module.css';

type BoardState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; orders: OrderJson[] };

export function PaymentQueueScreen() {
  const { searchQuery, refreshToken, bumpRefresh, selection, selectOrder } = useShell();
  const [board, setBoard] = useState<BoardState>({ kind: 'loading' });
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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
        <div>
          <h1>Pago</h1>
          <p className={styles.meta}>
            Órdenes listas. Selecciona una para ver el detalle; Cobrar abre la cuenta aquí en Pago.
          </p>
        </div>
      </header>

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
        <p className={styles.empty}>No hay órdenes listas para cobrar.</p>
      ) : null}

      {board.kind === 'ready' && orders.length > 0 ? (
        <ul className={styles.catalog}>
          {orders.map((order) => {
            const selected = selectedOrderId === order.id;
            return (
              <li
                key={order.id}
                className={[
                  styles.row,
                  shellStyles.selectable,
                  selected ? shellStyles.selectableSelected : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => selectOrder(order.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectOrder(order.id);
                  }
                }}
              >
                <h2>{originLabel(order)}</h2>
                <p className={styles.meta}>
                  <span>{openedAtLabel(order, timeZone)}</span>
                  <span className={styles.statusBadge}>{statusLabel(order.status)}</span>
                  <span>
                    {order.lines.length === 1 ? '1 línea' : `${order.lines.length} líneas`}
                  </span>
                </p>
                <div className={styles.actions}>
                  <Link
                    href={orderCuentaPath(order.id)}
                    className={styles.primaryLink}
                    onClick={(event) => event.stopPropagation()}
                  >
                    Cobrar
                  </Link>
                  <Link
                    href={orderDetailPath(order.id)}
                    onClick={(event) => event.stopPropagation()}
                  >
                    Ver comanda
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

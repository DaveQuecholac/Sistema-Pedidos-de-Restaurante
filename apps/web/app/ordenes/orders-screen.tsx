'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import shellStyles from '../components/app-shell/app-shell.module.css';
import { orderDetailPath } from '../components/app-shell/order-routes';
import { useShell } from '../components/app-shell/shell-context';
import { listOrders, type OrderJson } from './order-api';
import {
  boardView,
  errorText,
  openedAtLabel,
  originLabel,
  statusLabel,
  type BoardStatus,
} from './order-view';
import styles from './orders.module.css';

type BoardState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; orders: OrderJson[] };

type BoardFilter = 'active' | 'closed';

const ACTIVE_STATUSES = ['OPEN', 'SENT_TO_KITCHEN', 'IN_KITCHEN', 'READY'] as const;

export function OrdersScreen() {
  const { searchQuery, refreshToken, selection, selectOrder } = useShell();
  const [board, setBoard] = useState<BoardState>({ kind: 'loading' });
  const [filter, setFilter] = useState<BoardFilter>('active');
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const selectedOrderId = selection.kind === 'order' ? selection.orderId : null;

  useEffect(() => {
    void refreshBoard(setBoard, filter);
  }, [filter, refreshToken]);

  const view = boardView(toBoardStatus(board));
  const query = searchQuery.trim().toLowerCase();
  const visibleOrders = useMemo(() => {
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
          <h1>Órdenes</h1>
          <p className={styles.meta}>
            Selecciona una comanda para ver el detalle a la derecha.
          </p>
        </div>
      </header>

      <div className={styles.segmented} role="group" aria-label="Filtro de comandas">
        <button
          type="button"
          className={filter === 'active' ? styles.segmentActive : styles.segment}
          aria-pressed={filter === 'active'}
          onClick={() => setFilter('active')}
        >
          Activas
        </button>
        <button
          type="button"
          className={filter === 'closed' ? styles.segmentActive : styles.segment}
          aria-pressed={filter === 'closed'}
          onClick={() => setFilter('closed')}
        >
          Cerradas
        </button>
      </div>

      {view === 'loading' ? <p>Cargando comandas…</p> : null}

      {view === 'error' && board.kind === 'error' ? (
        <div className={styles.error} role="alert">
          <p>{board.message}</p>
          <button type="button" onClick={() => void refreshBoard(setBoard, filter)}>
            Reintentar
          </button>
        </div>
      ) : null}

      {view === 'empty' || view === 'list' ? (
        <section
          className={styles.panel}
          aria-label={filter === 'active' ? 'Comandas activas' : 'Comandas cerradas'}
        >
          {visibleOrders.length === 0 ? (
            <p className={styles.empty}>
              {query !== ''
                ? 'Ninguna comanda coincide con la búsqueda.'
                : filter === 'active'
                  ? 'No hay comandas abiertas, en cocción o listas.'
                  : 'No hay comandas cerradas.'}
            </p>
          ) : (
            <ul className={styles.catalog}>
              {visibleOrders.map((item) => {
                const selected = selectedOrderId === item.id;
                return (
                  <li
                    key={item.id}
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
                    onClick={() => selectOrder(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectOrder(item.id);
                      }
                    }}
                  >
                    <h2>{originLabel(item)}</h2>
                    <p className={styles.meta}>
                      <span>{openedAtLabel(item, timeZone)}</span>
                      <span className={styles.statusBadge}>{statusLabel(item.status)}</span>
                      <span>
                        {item.lines.length === 1 ? '1 línea' : `${item.lines.length} líneas`}
                      </span>
                    </p>
                    <div className={styles.actions}>
                      <Link
                        href={orderDetailPath(item.id)}
                        className={styles.primaryLink}
                        onClick={(event) => event.stopPropagation()}
                      >
                        Ver comanda
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

function toBoardStatus(board: BoardState): BoardStatus {
  if (board.kind === 'ready') {
    return { kind: 'ready', orders: board.orders };
  }
  return { kind: board.kind };
}

async function refreshBoard(
  setBoard: (board: BoardState) => void,
  filter: BoardFilter,
): Promise<void> {
  setBoard({ kind: 'loading' });
  try {
    const orders =
      filter === 'active' ? await listOrders(ACTIVE_STATUSES) : await listOrders(['CLOSED']);
    setBoard({ kind: 'ready', orders });
  } catch (error) {
    setBoard({ kind: 'error', message: errorText(error) });
  }
}

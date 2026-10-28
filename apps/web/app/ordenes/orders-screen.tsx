'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { shortOrderLabel } from '../components/app-shell/order-id-from-path';
import { orderDetailPath } from '../components/app-shell/order-routes';
import { useShell } from '../components/app-shell/shell-context';
import tableStyles from '../components/ui/data-table.module.css';
import { Tabs } from '../components/ui/tabs';
import { cancelOrder, listOrders, type OrderJson } from './order-api';
import {
  boardView,
  can,
  errorText,
  originLabel,
  statusLabel,
  type BoardStatus,
} from './order-view';
import styles from './orders.module.css';

type BoardState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; orders: OrderJson[] };

type OrdersTab = 'all' | 'dineIn' | 'external' | 'closed';
type BoardFilter = 'active' | 'closed';

const ACTIVE_STATUSES = ['OPEN', 'SENT_TO_KITCHEN', 'IN_KITCHEN', 'READY'] as const;

export function OrdersScreen() {
  const { searchQuery, refreshToken, selection, selectOrder, bumpRefresh } = useShell();
  const [board, setBoard] = useState<BoardState>({ kind: 'loading' });
  const [tab, setTab] = useState<OrdersTab>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const selectedOrderId = selection.kind === 'order' ? selection.orderId : null;

  const dataset: BoardFilter = tab === 'closed' ? 'closed' : 'active';

  useEffect(() => {
    void refreshBoard(setBoard, dataset);
  }, [dataset, refreshToken]);

  const view = boardView(toBoardStatus(board));
  const query = searchQuery.trim().toLowerCase();

  const counts = useMemo(() => {
    if (board.kind !== 'ready' || tab === 'closed') {
      return null;
    }
    return {
      all: board.orders.length,
      dineIn: board.orders.filter((order) => order.tableId !== null).length,
      external: board.orders.filter((order) => order.externalOrderId !== null).length,
    };
  }, [board, tab]);

  const visibleOrders = useMemo(() => {
    if (board.kind !== 'ready') {
      return [];
    }
    return board.orders.filter((order) => {
      if (tab === 'dineIn' && order.tableId === null) {
        return false;
      }
      if (tab === 'external' && order.externalOrderId === null) {
        return false;
      }
      if (query === '') {
        return true;
      }
      return (
        originLabel(order).toLowerCase().includes(query) ||
        order.id.toLowerCase().includes(query)
      );
    });
  }, [board, query, tab]);

  async function onCancel(order: OrderJson) {
    if (!window.confirm(`¿Cancelar la orden #${shortOrderLabel(order.id)}?`)) {
      return;
    }
    setNotice(null);
    try {
      await cancelOrder(order.id);
      bumpRefresh();
    } catch (error) {
      setNotice(errorText(error));
    }
  }

  return (
    <div className={styles.page}>
      <header className={`${styles.header} ${styles.headerRule}`}>
        <h1>Órdenes</h1>
      </header>

      <Tabs
        label="Filtro de comandas"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'all', label: 'Todas', count: counts?.all },
          { value: 'dineIn', label: 'En sala', count: counts?.dineIn },
          { value: 'external', label: 'Externas / Delivery', count: counts?.external },
          // Temporal: quítala cuando exista "Registro de pagos".
          { value: 'closed', label: 'Cerradas' },
        ]}
      />

      {notice ? (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      ) : null}

      {view === 'loading' ? <p>Cargando comandas…</p> : null}

      {view === 'error' && board.kind === 'error' ? (
        <div className={styles.error} role="alert">
          <p>{board.message}</p>
          <button type="button" onClick={() => void refreshBoard(setBoard, dataset)}>
            Reintentar
          </button>
        </div>
      ) : null}

      {view === 'empty' || view === 'list' ? (
        <section className={tableStyles.card} aria-label="Comandas">
          {visibleOrders.length === 0 ? (
            <p className={styles.empty} style={{ padding: '1rem' }}>
              {query !== ''
                ? 'Ninguna comanda coincide con la búsqueda.'
                : tab === 'closed'
                  ? 'No hay comandas cerradas.'
                  : 'No hay comandas abiertas, en cocción o listas.'}
            </p>
          ) : (
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
                {visibleOrders.map((item) => {
                  const selected = selectedOrderId === item.id;
                  return (
                    <tr
                      key={item.id}
                      className={selected ? tableStyles.rowSelected : undefined}
                      tabIndex={0}
                      aria-current={selected || undefined}
                      onClick={() => selectOrder(item.id)}
                      onKeyDown={(event) => {
                        if (
                          event.target === event.currentTarget &&
                          (event.key === 'Enter' || event.key === ' ')
                        ) {
                          event.preventDefault();
                          selectOrder(item.id);
                        }
                      }}
                    >
                      <td>#{shortOrderLabel(item.id)}</td>
                      <td>{item.tableId !== null ? 'Mesa' : 'Externo'}</td>
                      <td>{identifierLabel(item)}</td>
                      <td>{statusLabel(item.status)}</td>
                      <td>
                        <div className={tableStyles.actions}>
                          <Link
                            href={orderDetailPath(item.id)}
                            className={tableStyles.actionLink}
                            onClick={(event) => event.stopPropagation()}
                          >
                            Ver/Editar
                          </Link>
                          <button
                            type="button"
                            className={tableStyles.iconButton}
                            aria-label={`Cancelar orden ${shortOrderLabel(item.id)}`}
                            disabled={!can(item, 'cancel')}
                            onClick={(event) => {
                              event.stopPropagation();
                              void onCancel(item);
                            }}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
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

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
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
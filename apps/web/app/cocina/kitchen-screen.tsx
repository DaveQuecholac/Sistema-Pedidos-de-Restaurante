'use client';

import { useEffect, useMemo, useState } from 'react';
import { useShell } from '../components/app-shell/shell-context';
import { EmptyState } from '../components/ui/empty-state';
import { Tabs } from '../components/ui/tabs';
import {
  beginCooking,
  listOrders,
  markOrderReady,
  type OrderJson,
} from '../ordenes/order-api';
import {
  can,
  errorText,
  modifierLabel,
  openedAtLabel,
  originLabel,
} from '../ordenes/order-view';
import styles from './kitchen.module.css';

type BoardState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; orders: OrderJson[] };

type KitchenTab = 'pending' | 'cooking' | 'ready';

export function KitchenScreen() {
  const { searchQuery, selectedOrderId, setSelectedOrderId, refreshToken, bumpRefresh } =
    useShell();
  const [board, setBoard] = useState<BoardState>({ kind: 'loading' });
  const [tab, setTab] = useState<KitchenTab>('pending');
  const [notice, setNotice] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const busy = refreshing || sendingId !== null;

  useEffect(() => {
    void refreshBoard(setBoard);
  }, [refreshToken]);

  const query = searchQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    const source = board.kind === 'ready' ? board.orders : [];
    if (query === '') {
      return source;
    }
    return source.filter((order) => {
      const origin = originLabel(order).toLowerCase();
      return origin.includes(query) || order.id.toLowerCase().includes(query);
    });
  }, [board, query]);

  const pending = useMemo(() => sortByArrival(filtered, 'SENT_TO_KITCHEN'), [filtered]);
  const cooking = useMemo(() => sortByArrival(filtered, 'IN_KITCHEN'), [filtered]);
  const ready = useMemo(() => sortByArrival(filtered, 'READY'), [filtered]);

  const current = tab === 'pending' ? pending : tab === 'cooking' ? cooking : ready;
  const emptyText =
    tab === 'pending'
      ? 'Nada por cocinar todavía'
      : tab === 'cooking'
        ? 'Nada en el fuego'
        : 'Aún no hay órdenes listas';

  async function onRefresh() {
    setNotice(null);
    setRefreshing(true);
    try {
      await refreshBoard(setBoard);
    } finally {
      setRefreshing(false);
    }
  }

  async function runKitchenAction(
    orderId: string,
    action: () => Promise<OrderJson>,
  ): Promise<void> {
    setNotice(null);
    setSendingId(orderId);
    try {
      const updated = await action();
      setBoard((state) => {
        if (state.kind !== 'ready') {
          return state;
        }
        return { kind: 'ready', orders: replaceOrder(state.orders, updated) };
      });
      setSelectedOrderId(updated.id);
      bumpRefresh();
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setSendingId(null);
    }
  }

  function renderAction(order: OrderJson) {
    if (tab === 'pending' && can(order, 'beginCooking')) {
      return (
        <button
          type="button"
          className={styles.action}
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            void runKitchenAction(order.id, () => beginCooking(order.id));
          }}
        >
          Enviar a cocción
        </button>
      );
    }
    if (tab === 'cooking' && can(order, 'markReady')) {
      return (
        <button
          type="button"
          className={styles.action}
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            void runKitchenAction(order.id, () => markOrderReady(order.id));
          }}
        >
          Marcar lista
        </button>
      );
    }
    return null;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Cocina</h1>
        <button
          type="button"
          className={styles.refresh}
          disabled={busy}
          onClick={() => void onRefresh()}
        >
          Actualizar
        </button>
      </header>

      <Tabs
        label="Estado de cocina"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'pending', label: 'Pendientes', count: pending.length },
          { value: 'cooking', label: 'En cocción', count: cooking.length },
          { value: 'ready', label: 'Listas', count: ready.length },
        ]}
      />

      {notice ? (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      ) : null}

      {board.kind === 'loading' ? <p>Cargando cocina…</p> : null}

      {board.kind === 'error' ? (
        <div className={styles.error} role="alert">
          <p>{board.message}</p>
          <button type="button" disabled={busy} onClick={() => void onRefresh()}>
            Reintentar
          </button>
        </div>
      ) : null}

      {board.kind === 'ready' ? (
        current.length === 0 ? (
          <EmptyState text={emptyText} />
        ) : (
          <ul className={styles.ticketList}>
            {current.map((order) => {
              const action = renderAction(order);
              return (
                <li
                  key={order.id}
                  className={
                    selectedOrderId === order.id
                      ? `${styles.ticket} ${styles.ticketSelected}`
                      : styles.ticket
                  }
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedOrderId(order.id)}
                  onKeyDown={(event) => {
                    if (
                      event.target === event.currentTarget &&
                      (event.key === 'Enter' || event.key === ' ')
                    ) {
                      event.preventDefault();
                      setSelectedOrderId(order.id);
                    }
                  }}
                >
                  <div className={styles.ticketHead}>
                    <span className={styles.time}>{openedAtLabel(order, timeZone)}</span>
                    <span>{originLabel(order)}</span>
                  </div>
                  <OrderLines order={order} />
                  {action ? <div className={styles.actions}>{action}</div> : null}
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}

function OrderLines({ order }: { order: OrderJson }) {
  if (order.lines.length === 0) {
    return null;
  }

  return (
    <ul className={styles.lines}>
      {order.lines.map((line) => (
        <li key={line.id}>
          <div className={styles.line}>
            <span className={styles.qty}>X {line.quantity}</span>
            <span>{line.name}</span>
          </div>
          {line.modifiers.length > 0 ? (
            <ul className={styles.mods}>
              {line.modifiers.map((modifier) => (
                <li key={`${line.id}-${modifier.modifierId}`}>{modifierLabel(modifier)}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function sortByArrival(
  orders: readonly OrderJson[],
  status: OrderJson['status'],
): OrderJson[] {
  return orders
    .filter((order) => order.status === status)
    .slice()
    .sort((left, right) => left.openedAt.localeCompare(right.openedAt));
}

function replaceOrder(orders: readonly OrderJson[], updated: OrderJson): OrderJson[] {
  const rest = orders.filter((order) => order.id !== updated.id);
  if (
    updated.status === 'SENT_TO_KITCHEN' ||
    updated.status === 'IN_KITCHEN' ||
    updated.status === 'READY'
  ) {
    return [...rest, updated];
  }
  return rest;
}

async function refreshBoard(setBoard: (board: BoardState) => void): Promise<void> {
  setBoard({ kind: 'loading' });
  try {
    const orders = await listOrders(['SENT_TO_KITCHEN', 'IN_KITCHEN', 'READY']);
    setBoard({ kind: 'ready', orders });
  } catch (error) {
    setBoard({ kind: 'error', message: errorText(error) });
  }
}
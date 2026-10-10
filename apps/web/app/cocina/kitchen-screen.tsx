'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useShell } from '../components/app-shell/shell-context';
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
  statusLabel,
} from '../ordenes/order-view';
import styles from '../ordenes/orders.module.css';

type BoardState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; orders: OrderJson[] };

export function KitchenScreen() {
  const { searchQuery, selectedOrderId, setSelectedOrderId, refreshToken, bumpRefresh } =
    useShell();
  const [board, setBoard] = useState<BoardState>({ kind: 'loading' });
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

  const pending = useMemo(
    () => sortByArrival(filtered, 'SENT_TO_KITCHEN'),
    [filtered],
  );
  const cooking = useMemo(() => sortByArrival(filtered, 'IN_KITCHEN'), [filtered]);
  const ready = useMemo(() => sortByArrival(filtered, 'READY'), [filtered]);

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
      setBoard((current) => {
        if (current.kind !== 'ready') {
          return current;
        }
        return { kind: 'ready', orders: replaceOrder(current.orders, updated) };
      });
      setSelectedOrderId(updated.id);
      bumpRefresh();
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Cocina</h1>
          <p className={styles.meta}>Pendientes → cocción → listas</p>
        </div>
        <button
          type="button"
          className={styles.navButton}
          disabled={busy}
          onClick={() => void onRefresh()}
        >
          Actualizar
        </button>
      </header>

      {notice ? (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      ) : null}

      {board.kind === 'loading' ? <p>Cargando cocina…</p> : null}

      {board.kind === 'error' ? (
        <div className={styles.error} role="alert">
          <p>{board.message}</p>
          <button type="button" className={styles.navButton} disabled={busy} onClick={() => void onRefresh()}>
            Reintentar
          </button>
        </div>
      ) : null}

      {board.kind === 'ready' ? (
        <div className={styles.kitchenBoard}>
          <KitchenColumn
            title="Pendientes"
            count={pending.length}
            empty="Nada por cocinar todavía."
            orders={pending}
            timeZone={timeZone}
            selectedOrderId={selectedOrderId}
            onSelect={setSelectedOrderId}
            action={(order) =>
              can(order, 'beginCooking') ? (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation();
                    void runKitchenAction(order.id, () => beginCooking(order.id));
                  }}
                >
                  Poner en cocción
                </button>
              ) : null
            }
          />
          <KitchenColumn
            title="En cocción"
            count={cooking.length}
            empty="Nada en el fuego."
            orders={cooking}
            timeZone={timeZone}
            selectedOrderId={selectedOrderId}
            onSelect={setSelectedOrderId}
            action={(order) =>
              can(order, 'markReady') ? (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation();
                    void runKitchenAction(order.id, () => markOrderReady(order.id));
                  }}
                >
                  Marcar lista
                </button>
              ) : null
            }
          />
          <KitchenColumn
            title="Listas"
            count={ready.length}
            empty="Aún no hay órdenes listas."
            orders={ready}
            timeZone={timeZone}
            selectedOrderId={selectedOrderId}
            onSelect={setSelectedOrderId}
            action={() => null}
          />
        </div>
      ) : null}
    </div>
  );
}

function KitchenColumn({
  title,
  count,
  empty,
  orders,
  timeZone,
  selectedOrderId,
  onSelect,
  action,
}: {
  title: string;
  count: number;
  empty: string;
  orders: OrderJson[];
  timeZone: string;
  selectedOrderId: string | null;
  onSelect: (orderId: string) => void;
  action: (order: OrderJson) => ReactNode;
}) {
  return (
    <section className={styles.kitchenColumn} aria-label={title}>
      <header className={styles.kitchenColumnHeader}>
        <h2>{title}</h2>
        <span className={styles.statusBadge}>{count}</span>
      </header>
      {orders.length === 0 ? (
        <p className={styles.empty}>{empty}</p>
      ) : (
        <ul className={styles.ticketList}>
          {orders.map((order) => (
            <li
              key={order.id}
              className={
                selectedOrderId === order.id
                  ? `${styles.ticket} ${styles.ticketSelected}`
                  : styles.ticket
              }
              onClick={() => onSelect(order.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(order.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className={styles.ticketHead}>
                <h3>{originLabel(order)}</h3>
                <p className={styles.meta}>
                  <span>{openedAtLabel(order, timeZone)}</span>
                  <span className={styles.statusBadge}>{statusLabel(order.status)}</span>
                </p>
              </div>
              <OrderLines order={order} />
              <div className={styles.actions}>{action(order)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OrderLines({ order }: { order: OrderJson }) {
  if (order.lines.length === 0) {
    return <p className={styles.empty}>Sin líneas.</p>;
  }

  return (
    <ul className={styles.ticketLines}>
      {order.lines.map((line) => (
        <li key={line.id}>
          <p className={styles.ticketLineTitle}>
            <span className={styles.ticketQty}>×{line.quantity}</span> {line.name}
          </p>
          {line.modifiers.length > 0 ? (
            <ul className={styles.ticketMods}>
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

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  beginCooking,
  listOrders,
  markOrderReady,
  type OrderJson,
} from '../orders/order-api';
import {
  can,
  errorText,
  modifierLabel,
  openedAtLabel,
  originLabel,
  statusLabel,
} from '../orders/order-view';
import styles from '../orders/orders.module.css';

type BoardState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; orders: OrderJson[] };

export function KitchenScreen() {
  const [board, setBoard] = useState<BoardState>({ kind: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const busy = refreshing || sendingId !== null;

  useEffect(() => {
    void refreshBoard(setBoard);
  }, []);

  const pending = useMemo(
    () => sortByArrival(board.kind === 'ready' ? board.orders : [], 'SENT_TO_KITCHEN'),
    [board],
  );
  const cooking = useMemo(
    () => sortByArrival(board.kind === 'ready' ? board.orders : [], 'IN_KITCHEN'),
    [board],
  );
  const ready = useMemo(
    () => sortByArrival(board.kind === 'ready' ? board.orders : [], 'READY'),
    [board],
  );

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
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setSendingId(null);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Cocina</h1>
          <p className={styles.meta}>Pendientes → cocción → listas</p>
        </div>
        <nav className={styles.nav} aria-label="Secciones">
          <Link href="/">Inicio</Link>
          <Link href="/orders">Comandas</Link>
          <button
            type="button"
            className={styles.navButton}
            disabled={busy}
            onClick={() => void onRefresh()}
          >
            Actualizar
          </button>
        </nav>
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
            action={(order) =>
              can(order, 'beginCooking') ? (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy}
                  onClick={() => void runKitchenAction(order.id, () => beginCooking(order.id))}
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
            action={(order) =>
              can(order, 'markReady') ? (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy}
                  onClick={() => void runKitchenAction(order.id, () => markOrderReady(order.id))}
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
            action={() => null}
          />
        </div>
      ) : null}
    </main>
  );
}

function KitchenColumn({
  title,
  count,
  empty,
  orders,
  timeZone,
  action,
}: {
  title: string;
  count: number;
  empty: string;
  orders: OrderJson[];
  timeZone: string;
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
            <li key={order.id} className={styles.ticket}>
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

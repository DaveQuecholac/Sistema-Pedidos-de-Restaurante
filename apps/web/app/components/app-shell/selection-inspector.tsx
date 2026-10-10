'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  basisPointsToPercentLabel,
  centavosToLabel,
} from '../../menu/menu-amount';
import { listMenuItems, type MenuItemJson } from '../../menu/menu-api';
import {
  cancelOrder,
  getOrder,
  listOrders,
  openOrder,
  sendToKitchen,
  type OrderJson,
} from '../../ordenes/order-api';
import {
  can,
  errorText,
  modifierLabel,
  originLabel,
  statusLabel,
} from '../../ordenes/order-view';
import { getOrderTotals, type OrderTotalsJson } from '../../ordenes/[orderId]/cuenta/totals-api';
import styles from './app-shell.module.css';
import { orderIdFromPath, shortOrderLabel } from './order-id-from-path';
import { orderCobroPath, orderCuentaPath, orderDetailPath } from './order-routes';
import { useShell } from './shell-context';

const ACTIVE_STATUSES = ['OPEN', 'SENT_TO_KITCHEN', 'IN_KITCHEN', 'READY'] as const;

type OrderLoad =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; order: OrderJson; totals: OrderTotalsJson | null };

export function SelectionInspector() {
  const pathname = usePathname();
  const { selection, selectOrder, refreshToken } = useShell();
  const routeOrderId = orderIdFromPath(pathname);

  useEffect(() => {
    if (routeOrderId !== null) {
      selectOrder(routeOrderId);
    }
  }, [routeOrderId, selectOrder]);

  if (selection.kind === 'none' && routeOrderId === null) {
    return (
      <aside className={styles.summary} aria-label="Detalle">
        <div className={styles.summaryEmpty}>
          <strong>Detalle</strong>
          <p>Selecciona una mesa, un plato o una orden para verla aquí.</p>
        </div>
      </aside>
    );
  }

  if (selection.kind === 'table') {
    return <TableInspector tableId={selection.tableId} refreshToken={refreshToken} />;
  }

  if (selection.kind === 'menuItem') {
    return <MenuItemInspector menuItemId={selection.menuItemId} refreshToken={refreshToken} />;
  }

  const orderId =
    selection.kind === 'order' ? selection.orderId : routeOrderId;
  if (orderId === null) {
    return (
      <aside className={styles.summary} aria-label="Detalle">
        <div className={styles.summaryEmpty}>
          <strong>Detalle</strong>
          <p>Selecciona un elemento para verlo aquí.</p>
        </div>
      </aside>
    );
  }

  return <OrderInspector orderId={orderId} refreshToken={refreshToken} />;
}

function TableInspector({
  tableId,
  refreshToken,
}: {
  tableId: string;
  refreshToken: number;
}) {
  const router = useRouter();
  const { bumpRefresh, selectOrder } = useShell();
  const [order, setOrder] = useState<OrderJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotice(null);
    void listOrders(ACTIVE_STATUSES)
      .then((orders) => {
        if (cancelled) {
          return;
        }
        const match = orders
          .filter((item) => item.tableId === tableId)
          .sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0];
        setOrder(match ?? null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setNotice(errorText(error));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tableId, refreshToken]);

  async function onOpen() {
    setSending(true);
    setNotice(null);
    try {
      const created = await openOrder({ tableId });
      bumpRefresh();
      selectOrder(created.id);
      router.push(orderDetailPath(created.id));
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <aside className={styles.summary} aria-label="Detalle de mesa">
      <div className={styles.summaryHead}>
        <h2>Mesa {tableId}</h2>
        <p className={styles.summaryMeta}>
          <span className={styles.badge}>
            {loading ? '…' : order === null ? 'Libre' : statusLabel(order.status)}
          </span>
        </p>
      </div>

      {notice ? (
        <p className={styles.summaryNotice} role="alert">
          {notice}
        </p>
      ) : null}

      {loading ? <p>Cargando mesa…</p> : null}

      {!loading && order === null ? (
        <>
          <p className={styles.summaryEmpty}>Sin comanda activa en esta mesa.</p>
          <div className={styles.ctaStack}>
            <button
              type="button"
              className={styles.ctaPrimary}
              disabled={sending}
              onClick={() => void onOpen()}
            >
              Abrir comanda
            </button>
          </div>
        </>
      ) : null}

      {!loading && order !== null ? (
        <>
          <p className={styles.summaryMeta}>
            Orden #{shortOrderLabel(order.id)} · {order.lines.length}{' '}
            {order.lines.length === 1 ? 'línea' : 'líneas'}
          </p>
          <OrderLinesPreview order={order} />
          <div className={styles.ctaStack}>
            <Link className={styles.ctaPrimary} href={orderDetailPath(order.id)}>
              Ver comanda
            </Link>
            {order.status === 'READY' ? (
              <Link className={styles.ctaPrimary} href={orderCuentaPath(order.id)}>
                Ir a cobro
              </Link>
            ) : null}
            {order.status !== 'CLOSED' && order.status !== 'CANCELLED' ? (
              <Link className={styles.ctaSecondary} href={orderCuentaPath(order.id)}>
                Ver cuenta
              </Link>
            ) : null}
          </div>
        </>
      ) : null}
    </aside>
  );
}

function MenuItemInspector({
  menuItemId,
  refreshToken,
}: {
  menuItemId: string;
  refreshToken: number;
}) {
  const [item, setItem] = useState<MenuItemJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listMenuItems()
      .then((items) => {
        if (cancelled) {
          return;
        }
        setItem(items.find((row) => row.id === menuItemId) ?? null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setNotice(errorText(error));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [menuItemId, refreshToken]);

  if (loading) {
    return (
      <aside className={styles.summary} aria-label="Detalle de plato">
        <p>Cargando plato…</p>
      </aside>
    );
  }

  if (notice !== null || item === null) {
    return (
      <aside className={styles.summary} aria-label="Detalle de plato">
        <p className={styles.summaryNotice} role="alert">
          {notice ?? 'Ese plato no está en la carta.'}
        </p>
      </aside>
    );
  }

  return (
    <aside className={styles.summary} aria-label="Detalle de plato">
      <div className={styles.summaryHead}>
        <h2>{item.name}</h2>
        <p className={styles.summaryMeta}>
          <span className={styles.badge}>{item.active ? 'Activo' : 'Inactivo'}</span>
          <span>{centavosToLabel(item.price.amount)}</span>
          <span>Impuesto {basisPointsToPercentLabel(item.applicableTax.basisPoints)}</span>
        </p>
      </div>

      {item.ingredients.length > 0 ? (
        <div>
          <p className={styles.inspectorLabel}>Ingredientes</p>
          <ul className={styles.modList}>
            {item.ingredients.map((ingredient) => (
              <li key={ingredient.id}>{ingredient.name}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={styles.summaryEmpty}>Sin ingredientes registrados.</p>
      )}

      {item.modifiers.length > 0 ? (
        <div>
          <p className={styles.inspectorLabel}>Modificadores</p>
          <ul className={styles.modList}>
            {item.modifiers.map((modifier) => (
              <li key={modifier.id}>
                {modifier.kind === 'exclusion' ? 'Omitir' : 'Extra'} · {modifier.name}
                {modifier.kind === 'extra' && modifier.price !== null
                  ? ` · ${centavosToLabel(modifier.price.amount)}`
                  : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={styles.summaryEmpty}>Sin modificadores.</p>
      )}

      <p className={styles.summaryMeta}>
        Usa «Editar plato» en el centro para cambiar la carta.
      </p>
    </aside>
  );
}

function OrderInspector({
  orderId,
  refreshToken,
}: {
  orderId: string;
  refreshToken: number;
}) {
  const { bumpRefresh } = useShell();
  const [state, setState] = useState<OrderLoad>({ kind: 'loading' });
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    setNotice(null);
    void (async () => {
      try {
        const order = await getOrder(orderId);
        let totals: OrderTotalsJson | null = null;
        try {
          totals = await getOrderTotals(orderId);
        } catch {
          totals = null;
        }
        if (!cancelled) {
          setState({ kind: 'ready', order, totals });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ kind: 'error', message: errorText(error) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, refreshToken]);

  async function runAction(action: () => Promise<OrderJson>) {
    setSending(true);
    setNotice(null);
    try {
      const order = await action();
      let totals: OrderTotalsJson | null = null;
      try {
        totals = await getOrderTotals(order.id);
      } catch {
        totals = null;
      }
      setState({ kind: 'ready', order, totals });
      bumpRefresh();
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setSending(false);
    }
  }

  if (state.kind === 'loading') {
    return (
      <aside className={styles.summary} aria-label="Detalle de orden">
        <p>Cargando orden…</p>
      </aside>
    );
  }

  if (state.kind === 'error') {
    return (
      <aside className={styles.summary} aria-label="Detalle de orden">
        <p className={styles.summaryNotice} role="alert">
          {state.message}
        </p>
      </aside>
    );
  }

  const { order, totals } = state;

  return (
    <aside className={styles.summary} aria-label="Detalle de orden">
      <div className={styles.summaryHead}>
        <h2>ORDEN #{shortOrderLabel(order.id)}</h2>
        <p className={styles.summaryMeta}>
          <span>{originLabel(order)}</span>
          <span className={styles.badge}>{statusLabel(order.status)}</span>
        </p>
      </div>

      {notice ? (
        <p className={styles.summaryNotice} role="alert">
          {notice}
        </p>
      ) : null}

      <OrderLinesPreview order={order} />

      {totals !== null ? (
        <div className={styles.totals}>
          <div className={styles.totalsRow}>
            <span>Subtotal</span>
            <span>{centavosToLabel(totals.subtotal.amount)}</span>
          </div>
          {totals.discount !== null ? (
            <div className={styles.totalsRow}>
              <span>Descuento</span>
              <span>-{centavosToLabel(totals.discount.amount.amount)}</span>
            </div>
          ) : null}
          <div className={styles.totalsRow}>
            <span>Impuestos</span>
            <span>{centavosToLabel(totals.taxTotal.amount)}</span>
          </div>
          {totals.tip !== null ? (
            <div className={styles.totalsRow}>
              <span>Propina</span>
              <span>{centavosToLabel(totals.tip.amount.amount)}</span>
            </div>
          ) : null}
          <div className={styles.totalsTotal}>
            <span>Total</span>
            <span>{centavosToLabel(totals.total.amount)}</span>
          </div>
        </div>
      ) : null}

      <div className={styles.ctaStack}>
        <Link className={styles.ctaSecondary} href={orderDetailPath(order.id)}>
          Ver comanda
        </Link>
        {can(order, 'sendToKitchen') ? (
          <button
            type="button"
            className={styles.ctaPrimary}
            disabled={sending}
            onClick={() => void runAction(() => sendToKitchen(order.id))}
          >
            Enviar a cocina
          </button>
        ) : null}
        {order.status !== 'CLOSED' && order.status !== 'CANCELLED' ? (
          <Link className={styles.ctaSecondary} href={orderCuentaPath(order.id)}>
            Ver cuenta
          </Link>
        ) : null}
        {order.status === 'READY' ? (
          <Link className={styles.ctaPrimary} href={orderCuentaPath(order.id)}>
            Cobrar
          </Link>
        ) : null}
        {order.status === 'CLOSED' ? (
          <Link className={styles.ctaSecondary} href={orderCobroPath(order.id)}>
            Ver cobro
          </Link>
        ) : null}
        {can(order, 'cancel') ? (
          <button
            type="button"
            className={styles.ctaDanger}
            disabled={sending}
            onClick={() => void runAction(() => cancelOrder(order.id))}
          >
            Cancelar orden
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function OrderLinesPreview({ order }: { order: OrderJson }) {
  if (order.lines.length === 0) {
    return <p className={styles.summaryEmpty}>Sin productos todavía.</p>;
  }

  return (
    <ul className={styles.lineList}>
      {order.lines.map((line) => (
        <li key={line.id} className={styles.lineItem}>
          <strong>{line.name}</strong>
          <p className={styles.lineMeta}>
            <span>× {line.quantity}</span>
            <span>{centavosToLabel(line.unitPrice.amount)}</span>
          </p>
          {line.modifiers.length > 0 ? (
            <ul className={styles.modList}>
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

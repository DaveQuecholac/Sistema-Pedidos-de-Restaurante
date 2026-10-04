'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  listOrders,
  openOrder,
  OrderApiError,
  type OrderJson,
} from './order-api';
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

type OriginKind = 'table' | 'external';
type BoardFilter = 'active' | 'closed';

const ACTIVE_STATUSES = ['OPEN', 'SENT_TO_KITCHEN', 'IN_KITCHEN', 'READY'] as const;

export function OrdersScreen() {
  const router = useRouter();
  const [board, setBoard] = useState<BoardState>({ kind: 'loading' });
  const [filter, setFilter] = useState<BoardFilter>('active');
  const [originKind, setOriginKind] = useState<OriginKind>('table');
  const [originValue, setOriginValue] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    void refreshBoard(setBoard, filter);
  }, [filter]);

  const view = boardView(toBoardStatus(board));

  async function onOpen() {
    const trimmed = originValue.trim();
    if (trimmed === '') {
      setNotice(
        originKind === 'table'
          ? 'Escribe el número o nombre de la mesa.'
          : 'Escribe el id del pedido externo.',
      );
      return;
    }

    setNotice(null);
    setSending(true);
    try {
      const created = await openOrder(
        originKind === 'table' ? { tableId: trimmed } : { externalOrderId: trimmed },
      );
      router.push(`/orders/${encodeURIComponent(created.id)}`);
    } catch (error) {
      setNotice(errorText(error));
      if (error instanceof OrderApiError && error.code === 'ExternalOrderIdInUseError') {
        await refreshBoard(setBoard, filter);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Comandas</h1>
        <nav className={styles.nav} aria-label="Secciones">
          <Link href="/">Inicio</Link>
          <Link href="/kitchen">Cocina</Link>
        </nav>
      </header>

      <div className={styles.segmented} role="group" aria-label="Filtro de comandas">
        <button
          type="button"
          className={filter === 'active' ? styles.segmentActive : styles.segment}
          aria-pressed={filter === 'active'}
          disabled={sending}
          onClick={() => setFilter('active')}
        >
          Activas
        </button>
        <button
          type="button"
          className={filter === 'closed' ? styles.segmentActive : styles.segment}
          aria-pressed={filter === 'closed'}
          disabled={sending}
          onClick={() => setFilter('closed')}
        >
          Cerradas
        </button>
      </div>

      {view === 'loading' ? <p>Cargando comandas…</p> : null}

      {view === 'error' && board.kind === 'error' ? (
        <div className={styles.error} role="alert">
          <p>{board.message}</p>
          <button
            type="button"
            disabled={sending}
            onClick={() => void refreshBoard(setBoard, filter)}
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {view === 'empty' || view === 'list' ? (
        <div className={styles.workspace}>
          <section
            className={styles.monitor}
            aria-label={filter === 'active' ? 'Comandas activas' : 'Comandas cerradas'}
          >
            <div className={styles.bezel}>
              <div className={styles.screen}>
                {view === 'empty' ? (
                  <p className={styles.empty}>
                    {filter === 'active'
                      ? 'No hay comandas abiertas, en cocción o listas.'
                      : 'No hay comandas cerradas.'}
                  </p>
                ) : (
                  <ul className={styles.catalog}>
                    {board.kind === 'ready'
                      ? board.orders.map((item) => (
                          <li key={item.id} className={styles.row}>
                            <h2>{originLabel(item)}</h2>
                            <p className={styles.meta}>
                              <span>{openedAtLabel(item, timeZone)}</span>
                              <span className={styles.statusBadge}>{statusLabel(item.status)}</span>
                              <span>
                                {item.lines.length === 1
                                  ? '1 línea'
                                  : `${item.lines.length} líneas`}
                              </span>
                            </p>
                            <div className={styles.actions}>
                              <Link href={`/orders/${encodeURIComponent(item.id)}`}>
                                Ver comanda
                              </Link>
                            </div>
                          </li>
                        ))
                      : null}
                  </ul>
                )}
              </div>
              <div className={styles.chin}>
                <span className={styles.power} aria-hidden="true" />
              </div>
            </div>
            <div className={styles.neck} aria-hidden="true" />
            <div className={styles.base} aria-hidden="true" />
          </section>

          {filter === 'active' ? (
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                void onOpen();
              }}
            >
              <h2>Abrir comanda</h2>
              <label>
                Origen
                <select
                  value={originKind}
                  disabled={sending}
                  onChange={(event) => setOriginKind(event.target.value as OriginKind)}
                >
                  <option value="table">Mesa</option>
                  <option value="external">Pedido externo</option>
                </select>
              </label>
              <label>
                {originKind === 'table' ? 'Mesa' : 'Id externo'}
                <input
                  value={originValue}
                  disabled={sending}
                  autoComplete="off"
                  onChange={(event) => setOriginValue(event.target.value)}
                />
              </label>
              {notice ? (
                <p className={styles.notice} role="alert">
                  {notice}
                </p>
              ) : null}
              <button type="submit" className={styles.primary} disabled={sending}>
                Abrir comanda
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </main>
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
      filter === 'active'
        ? await listOrders(ACTIVE_STATUSES)
        : await listOrders(['CLOSED']);
    setBoard({ kind: 'ready', orders });
  } catch (error) {
    setBoard({ kind: 'error', message: errorText(error) });
  }
}

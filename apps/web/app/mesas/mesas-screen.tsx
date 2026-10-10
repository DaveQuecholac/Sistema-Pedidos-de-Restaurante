'use client';

import { useEffect, useMemo, useState } from 'react';
import shellStyles from '../components/app-shell/app-shell.module.css';
import { useShell } from '../components/app-shell/shell-context';
import { listOrders, type OrderJson } from '../ordenes/order-api';
import { errorText, statusLabel } from '../ordenes/order-view';
import styles from './mesas.module.css';

const ACTIVE_STATUSES = ['OPEN', 'SENT_TO_KITCHEN', 'IN_KITCHEN', 'READY'] as const;

const FLOORS = [
  {
    id: '1',
    label: 'Salón',
    tables: ['1', '2', '3', '4', '5', '6'],
  },
] as const;

type BoardState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; orders: OrderJson[] };

export function MesasScreen() {
  const { searchQuery, refreshToken, bumpRefresh, selection, selectTable } = useShell();
  const [board, setBoard] = useState<BoardState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setBoard({ kind: 'loading' });
    void listOrders(ACTIVE_STATUSES)
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

  const byTable = useMemo(() => {
    const map = new Map<string, OrderJson>();
    if (board.kind !== 'ready') {
      return map;
    }
    for (const order of board.orders) {
      if (order.tableId === null) {
        continue;
      }
      const existing = map.get(order.tableId);
      if (existing === undefined || existing.openedAt < order.openedAt) {
        map.set(order.tableId, order);
      }
    }
    return map;
  }, [board]);

  const query = searchQuery.trim().toLowerCase();
  const selectedTableId = selection.kind === 'table' ? selection.tableId : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Mesas</h1>
          <p className={styles.lead}>
            Selecciona una mesa para ver el detalle a la derecha. Abre o entra a la comanda desde ahí.
          </p>
        </div>
      </header>

      {board.kind === 'loading' ? <p>Cargando mesas…</p> : null}

      {board.kind === 'error' ? (
        <div className={styles.error} role="alert">
          <p>{board.message}</p>
          <button type="button" onClick={() => bumpRefresh()}>
            Reintentar
          </button>
        </div>
      ) : null}

      {FLOORS.map((floor) => {
        const tables = floor.tables.filter((tableId) => {
          if (query === '') {
            return true;
          }
          return (
            tableId.toLowerCase().includes(query) ||
            floor.label.toLowerCase().includes(query)
          );
        });
        if (tables.length === 0) {
          return null;
        }
        return (
          <section key={floor.id} className={styles.floor} aria-label={floor.label}>
            <h2 className={styles.floorLabel}>{floor.label}</h2>
            <ul className={styles.grid}>
              {tables.map((tableId) => {
                const order = byTable.get(tableId);
                const occupied = order !== undefined;
                const selected = selectedTableId === tableId;
                return (
                  <li key={tableId}>
                    <button
                      type="button"
                      className={[
                        occupied ? styles.tableOccupied : styles.tableFree,
                        shellStyles.selectable,
                        selected ? shellStyles.selectableSelected : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-pressed={selected}
                      onClick={() => selectTable(tableId)}
                    >
                      <span className={styles.tableNumber}>{tableId}</span>
                      <span className={styles.tableStatus}>
                        {board.kind === 'loading'
                          ? '…'
                          : occupied && order !== undefined
                            ? statusLabel(order.status)
                            : 'Libre'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

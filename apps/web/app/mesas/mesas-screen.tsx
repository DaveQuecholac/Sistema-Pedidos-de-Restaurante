'use client';

import { useEffect, useMemo, useState } from 'react';
import { TableIcon } from '../components/ui/table-icon'; 
import { useShell } from '../components/app-shell/shell-context';
import { listOrders, OrderApiError, type OrderJson } from '../ordenes/order-api';
import { errorText, statusLabel } from '../ordenes/order-view';
import { listTables, TablesApiError, type TableJson } from './mesas-api';
import styles from './mesas.module.css';

const ACTIVE_STATUSES = ['OPEN', 'SENT_TO_KITCHEN', 'IN_KITCHEN', 'READY'] as const;

type BoardState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; tables: TableJson[]; orders: OrderJson[] };

export function MesasScreen() {
  const { searchQuery, refreshToken, bumpRefresh, selection, selectTable } = useShell();
  const [board, setBoard] = useState<BoardState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setBoard({ kind: 'loading' });
    void Promise.all([listTables(), listOrders([...ACTIVE_STATUSES])])
      .then(([tables, orders]) => {
        if (!cancelled) {
          setBoard({
            kind: 'ready',
            tables: tables.filter((table) => table.active),
            orders,
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setBoard({ kind: 'error', message: boardErrorText(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const byTable = useMemo(() => {
    const map = new Map<string, { order: OrderJson; count: number }>();
    if (board.kind !== 'ready') {
      return map;
    }
    for (const order of board.orders) {
      if (order.tableId === null) {
        continue;
      }
      const existing = map.get(order.tableId);
      if (existing === undefined) {
        map.set(order.tableId, { order, count: 1 });
        continue;
      }
      existing.count += 1;
      if (existing.order.openedAt < order.openedAt) {
        existing.order = order;
      }
    }
    return map;
  }, [board]);

  const floors = useMemo(() => {
    if (board.kind !== 'ready') {
      return [];
    }
    const query = searchQuery.trim().toLowerCase();
    const grouped = new Map<string, TableJson[]>();

    for (const table of board.tables) {
      if (
        query !== '' &&
        !table.id.toLowerCase().includes(query) &&
        !table.label.toLowerCase().includes(query) &&
        !table.zone.toLowerCase().includes(query)
      ) {
        continue;
      }
      const current = grouped.get(table.zone);
      if (current === undefined) {
        grouped.set(table.zone, [table]);
      } else {
        current.push(table);
      }
    }

    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right, 'es'))
      .map(([zone, tables]) => ({
        zone,
        tables: [...tables].sort((left, right) => left.id.localeCompare(right.id, 'es', { numeric: true })),
      }));
  }, [board, searchQuery]);

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

      {board.kind === 'ready' && floors.length === 0 ? (
        <p className={styles.empty}>
          {board.tables.length === 0
            ? 'No hay mesas activas en el salón.'
            : 'Ninguna mesa coincide con la búsqueda.'}
        </p>
      ) : null}

      {floors.map((floor) => (
        <section key={floor.zone} className={styles.floor} aria-label={floor.zone}>
          <h2 className={styles.floorLabel}>{floor.zone}</h2>
          <ul className={styles.grid}>
            {floor.tables.map((table) => {
              const group = byTable.get(table.id);
              const occupied = group !== undefined;
              const selected = selectedTableId === table.id;
              const status =
                group === undefined
                  ? 'Libre'
                  : group.count > 1
                    ? `${group.count} comandas`
                    : statusLabel(group.order.status);
              return (
                <li key={table.id}>
                  <button
                    type="button"
                    className={[
                      occupied ? styles.tableOccupied : styles.tableFree,
                      selected ? styles.tableSelected : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-pressed={selected}
                    onClick={() => selectTable(table.id)}
                  >
                    
                    <span className={styles.tableNumber}>{table.label}</span>
                    <TableIcon className={styles.tableSvg} />
                    <span className={styles.tableStatus}>{status}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function boardErrorText(error: unknown): string {
  if (error instanceof TablesApiError) {
    return errorText(new OrderApiError(error.status, error.message, error.code));
  }
  return errorText(error);
}

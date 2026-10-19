'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { orderCobroPath, orderCuentaPath } from '../../components/app-shell/order-routes';
import { useShell } from '../../components/app-shell/shell-context';
import { EmptyState } from '../../components/ui/empty-state';
import { listMenuItems, type MenuItemJson } from '../../menu/menu-api';
import { centavosToLabel } from '../../menu/menu-amount';
import {
  addLine,
  cancelLine,
  getOrder,
  modifyLine,
  OrderApiError,
  type LineItemJson,
  type OrderJson,
} from '../order-api';
import {
  can,
  errorText,
  lockNotice,
  modifierLabel,
  orderableItems,
  originLabel,
  preselect,
  statusLabel,
} from '../order-view';
import styles from './order-detail.module.css';

type OrderState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; order: OrderJson };

type MenuState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; items: MenuItemJson[] };

type Props = {
  orderId: string;
};

export function OrderDetailScreen({ orderId }: Props) {
  const { bumpRefresh, setSelectedOrderId, refreshToken } = useShell();
  const [orderState, setOrderState] = useState<OrderState>({ kind: 'loading' });
  const [menuState, setMenuState] = useState<MenuState>({ kind: 'loading' });
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [menuItemId, setMenuItemId] = useState('');
  const [quantityText, setQuantityText] = useState('1');
  const [modifierIds, setModifierIds] = useState<string[]>([]);
  const [missingModifiers, setMissingModifiers] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setSelectedOrderId(orderId);
    void loadAll(orderId, setOrderState, setMenuState);
  }, [orderId, setSelectedOrderId]);

  // Si el panel derecho cambia la orden (enviar a cocina, cancelar), recarga esta vista.
  const lastRefreshToken = useRef(refreshToken);
  useEffect(() => {
    if (lastRefreshToken.current === refreshToken) {
      return;
    }
    lastRefreshToken.current = refreshToken;
    void reloadOrder(orderId, setOrderState);
  }, [refreshToken, orderId]);

  const order = orderState.kind === 'ready' ? orderState.order : null;
  const editable = order !== null && can(order, 'editLines');
  const dishes = menuState.kind === 'ready' ? orderableItems(menuState.items) : [];
  const formDishes = useMemo(() => {
    if (menuState.kind !== 'ready' || editingLineId === null) {
      return dishes;
    }
    const current = menuState.items.find((item) => item.id === menuItemId);
    if (current === undefined || dishes.some((item) => item.id === current.id)) {
      return dishes;
    }
    return [current, ...dishes];
  }, [dishes, editingLineId, menuItemId, menuState]);
  const selectedDish = useMemo(
    () =>
      formDishes.find((item) => item.id === menuItemId) ??
      (menuState.kind === 'ready'
        ? (menuState.items.find((item) => item.id === menuItemId) ?? null)
        : null),
    [formDishes, menuItemId, menuState],
  );
  const showForm =
    editable && menuState.kind === 'ready' && dishes.length > 0;

  function resetLineForm(nextDishes: MenuItemJson[] = dishes) {
    setEditingLineId(null);
    setMenuItemId(nextDishes[0]?.id ?? '');
    setQuantityText('1');
    setModifierIds([]);
    setMissingModifiers(false);
  }

  useEffect(() => {
    if (editingLineId !== null) {
      return;
    }
    if (menuItemId === '' && dishes[0] !== undefined) {
      setMenuItemId(dishes[0].id);
    }
  }, [dishes, editingLineId, menuItemId]);

  function startEdit(line: LineItemJson) {
    if (menuState.kind !== 'ready') {
      return;
    }
    const dish =
      menuState.items.find((item) => item.id === line.menuItemId) ??
      dishes.find((item) => item.id === line.menuItemId);
    if (dish === undefined) {
      setNotice('Ese plato ya no está en la carta para editarlo.');
      return;
    }
    const chosen = preselect(line, dish);
    setEditingLineId(line.id);
    setMenuItemId(dish.id);
    setQuantityText(String(line.quantity));
    setModifierIds(chosen.modifierIds);
    setMissingModifiers(chosen.missing);
    setNotice(null);
  }

  async function runMutation(action: () => Promise<OrderJson>) {
    setNotice(null);
    setSending(true);
    try {
      const updated = await action();
      setOrderState({ kind: 'ready', order: updated });
      resetLineForm();
      bumpRefresh();
    } catch (error) {
      setNotice(errorText(error));
      if (error instanceof OrderApiError && error.status === 409) {
        await reloadOrder(orderId, setOrderState);
        setEditingLineId(null);
        setMissingModifiers(false);
        bumpRefresh();
      }
    } finally {
      setSending(false);
    }
  }

  async function onSubmitLine() {
    if (order === null) {
      return;
    }
    if (menuItemId.trim() === '') {
      setNotice('Elige un plato.');
      return;
    }
    const quantity = Number(quantityText.trim());
    if (!Number.isInteger(quantity)) {
      setNotice('La cantidad tiene que ser un número entero.');
      return;
    }

    if (editingLineId === null) {
      await runMutation(() =>
        addLine(order.id, { menuItemId, quantity, modifierIds }),
      );
      return;
    }

    await runMutation(() =>
      modifyLine(order.id, editingLineId, { quantity, modifierIds }),
    );
  }

  if (orderState.kind === 'loading') {
    return (
      <div className={styles.page}>
        <p>Cargando comanda…</p>
      </div>
    );
  }

  if (orderState.kind === 'missing') {
    return (
      <div className={styles.page}>
        <p className={styles.notice} role="alert">
          Esa comanda no existe
        </p>
        <p>
          <Link href="/ordenes">Órdenes</Link>
        </p>
      </div>
    );
  }

  if (orderState.kind === 'error') {
    return (
      <div className={styles.page}>
        <div className={styles.error} role="alert">
          <p>{orderState.message}</p>
          <button
            type="button"
            disabled={sending}
            onClick={() => void loadAll(orderId, setOrderState, setMenuState)}
          >
            Reintentar
          </button>
        </div>
        <p>
          <Link href="/ordenes">Órdenes</Link>
        </p>
      </div>
    );
  }

  const current = orderState.order;
  const lock = lockNotice(current);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h1>{originLabel(current)}</h1>
          <span className={styles.badge}>{statusLabel(current.status)}</span>
        </div>
        <nav className={styles.navChips} aria-label="Acciones de comanda">
          <Link href={orderCuentaPath(orderId)} className={styles.navChip}>
            Cuenta
          </Link>
          {current.status === 'CLOSED' ? (
            <Link href={orderCobroPath(orderId)} className={styles.navChip}>
              Ver cobro
            </Link>
          ) : null}
        </nav>
      </header>

      {notice ? (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      ) : null}

      {lock !== null ? (
        <p className={styles.lockNotice} role="status">
          {lock}
        </p>
      ) : null}

      {editable && (menuState.kind === 'error' || dishes.length === 0) ? (
        <p className={styles.notice} role="alert">
          No se pudo cargar el menú
        </p>
      ) : null}

      <div className={styles.workspace}>
        <section aria-label="Líneas de la comanda">
          {current.lines.length === 0 ? (
            <EmptyState text="Todavía no hay platos en esta comanda" />
          ) : (
            <ul className={styles.lines}>
              {current.lines.map((line) => (
                <li
                  key={line.id}
                  className={
                    editingLineId === line.id
                      ? `${styles.line} ${styles.lineEditing}`
                      : styles.line
                  }
                >
                  <div className={styles.lineInfo}>
                    <p className={styles.lineName}>{line.name}</p>
                    <p className={styles.lineMeta}>
                      <span>× {line.quantity}</span>
                      <span>{centavosToLabel(line.unitPrice.amount)}</span>
                    </p>
                    {line.modifiers.length > 0 ? (
                      <ul className={styles.lineMods}>
                        {line.modifiers.map((modifier) => (
                          <li key={`${line.id}-${modifier.modifierId}`}>
                            {modifierLabel(modifier)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  {editable ? (
                    <div className={styles.iconActions}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Editar ${line.name}`}
                        title="Editar"
                        disabled={sending}
                        onClick={() => startEdit(line)}
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                        aria-label={`Quitar ${line.name}`}
                        title="Quitar"
                        disabled={sending}
                        onClick={() =>
                          void runMutation(() => cancelLine(current.id, line.id))
                        }
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {showForm ? (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmitLine();
            }}
          >
            <h2>{editingLineId === null ? 'Agregar plato' : 'Editar línea'}</h2>
            {missingModifiers ? (
              <p className={styles.notice} role="status">
                Algún modificador de esta línea ya no está en la carta.
              </p>
            ) : null}
            <label>
              Plato
              <select
                value={menuItemId}
                disabled={sending || editingLineId !== null}
                onChange={(event) => {
                  setMenuItemId(event.target.value);
                  setModifierIds([]);
                  setMissingModifiers(false);
                }}
              >
                {formDishes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cantidad
              <input
                inputMode="numeric"
                value={quantityText}
                disabled={sending}
                onChange={(event) => setQuantityText(event.target.value)}
              />
            </label>
            {selectedDish !== null && selectedDish.modifiers.length > 0 ? (
              <fieldset className={styles.checks}>
                <legend>Modificadores</legend>
                {selectedDish.modifiers.map((modifier) => (
                  <label key={modifier.id} className={styles.checkRow}>
                    <input
                      type="checkbox"
                      checked={modifierIds.includes(modifier.id)}
                      disabled={sending}
                      onChange={(event) => {
                        setModifierIds((previous) =>
                          event.target.checked
                            ? [...previous, modifier.id]
                            : previous.filter((id) => id !== modifier.id),
                        );
                      }}
                    />
                    <span>
                      {modifier.kind === 'exclusion'
                        ? `sin ${modifier.name}`
                        : `+ ${modifier.name}${
                            modifier.price === null
                              ? ''
                              : ` ${centavosToLabel(modifier.price.amount)}`
                          }`}
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            {editingLineId === null ? (
              <button type="submit" className={styles.primary} disabled={sending}>
                Agregar plato
              </button>
            ) : (
              <>
                <button type="submit" className={styles.primary} disabled={sending}>
                  Guardar cambios
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={sending}
                  onClick={() => {
                    resetLineForm();
                    setNotice(null);
                  }}
                >
                  Cancelar
                </button>
              </>
            )}
          </form>
        ) : null}
      </div>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4l10-10-4-4L4 16v4z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

async function loadAll(
  orderId: string,
  setOrderState: (state: OrderState) => void,
  setMenuState: (state: MenuState) => void,
): Promise<void> {
  setOrderState({ kind: 'loading' });
  setMenuState({ kind: 'loading' });

  const [orderResult, menuResult] = await Promise.allSettled([
    getOrder(orderId),
    listMenuItems(),
  ]);

  if (orderResult.status === 'fulfilled') {
    setOrderState({ kind: 'ready', order: orderResult.value });
  } else if (
    orderResult.reason instanceof OrderApiError &&
    orderResult.reason.status === 404
  ) {
    setOrderState({ kind: 'missing' });
  } else {
    setOrderState({ kind: 'error', message: errorText(orderResult.reason) });
  }

  if (menuResult.status === 'fulfilled') {
    setMenuState({ kind: 'ready', items: menuResult.value });
  } else {
    setMenuState({ kind: 'error' });
  }
}

async function reloadOrder(
  orderId: string,
  setOrderState: (state: OrderState) => void,
): Promise<void> {
  try {
    const order = await getOrder(orderId);
    setOrderState({ kind: 'ready', order });
  } catch (error) {
    if (error instanceof OrderApiError && error.status === 404) {
      setOrderState({ kind: 'missing' });
      return;
    }
    setOrderState({ kind: 'error', message: errorText(error) });
  }
}
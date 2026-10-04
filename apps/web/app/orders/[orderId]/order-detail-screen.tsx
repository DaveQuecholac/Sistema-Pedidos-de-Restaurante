'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { listMenuItems, type MenuItemJson } from '../../menu/menu-api';
import { centavosToLabel } from '../../menu/menu-amount';
import {
  addLine,
  cancelLine,
  cancelOrder,
  getOrder,
  modifyLine,
  OrderApiError,
  sendToKitchen,
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
import styles from '../orders.module.css';

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
  const [orderState, setOrderState] = useState<OrderState>({ kind: 'loading' });
  const [menuState, setMenuState] = useState<MenuState>({ kind: 'loading' });
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [menuItemId, setMenuItemId] = useState('');
  const [quantityText, setQuantityText] = useState('1');
  const [modifierIds, setModifierIds] = useState<string[]>([]);
  const [missingModifiers, setMissingModifiers] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    void loadAll(orderId, setOrderState, setMenuState);
  }, [orderId]);

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
      setConfirmCancel(false);
      resetLineForm();
    } catch (error) {
      setNotice(errorText(error));
      if (error instanceof OrderApiError && error.status === 409) {
        await reloadOrder(orderId, setOrderState);
        setEditingLineId(null);
        setMissingModifiers(false);
        setConfirmCancel(false);
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
      <main className={styles.page}>
        <p>Cargando comanda…</p>
      </main>
    );
  }

  if (orderState.kind === 'missing') {
    return (
      <main className={styles.page}>
        <p className={styles.notice} role="alert">
          Esa comanda no existe
        </p>
        <p>
          <Link href="/orders">Comandas</Link>
        </p>
      </main>
    );
  }

  if (orderState.kind === 'error') {
    return (
      <main className={styles.page}>
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
          <Link href="/orders">Comandas</Link>
        </p>
      </main>
    );
  }

  const current = orderState.order;
  const lock = lockNotice(current);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{originLabel(current)}</h1>
          <p className={styles.meta}>
            <span className={styles.statusBadge}>{statusLabel(current.status)}</span>
          </p>
        </div>
        <nav className={styles.nav} aria-label="Secciones">
          <Link href="/orders">Comandas</Link>
        </nav>
      </header>

      {notice ? (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      ) : null}

      <div className={styles.workspace}>
        <section className={styles.monitor} aria-label="Líneas de la comanda">
          <div className={styles.bezel}>
            <div className={styles.screen}>
              {current.lines.length === 0 ? (
                <p className={styles.empty}>Todavía no hay platos en esta comanda.</p>
              ) : (
                <ul className={styles.catalog}>
                  {current.lines.map((line) => (
                    <li key={line.id} className={styles.lineRow}>
                      <strong>{line.name}</strong>
                      <p className={styles.meta}>
                        <span>× {line.quantity}</span>
                        <span>{centavosToLabel(line.unitPrice.amount)}</span>
                      </p>
                      {line.modifiers.length > 0 ? (
                        <ul className={styles.checkList}>
                          {line.modifiers.map((modifier) => (
                            <li key={`${line.id}-${modifier.modifierId}`}>
                              {modifierLabel(modifier)}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {editable ? (
                        <div className={styles.actions}>
                          <button
                            type="button"
                            disabled={sending}
                            onClick={() => startEdit(line)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={sending}
                            onClick={() =>
                              void runMutation(() => cancelLine(current.id, line.id))
                            }
                          >
                            Quitar
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className={styles.chin} aria-hidden="true">
              <span className={styles.power} />
            </div>
          </div>
          <div className={styles.neck} aria-hidden="true" />
          <div className={styles.base} aria-hidden="true" />

          <div className={styles.actionBar}>
            {can(current, 'sendToKitchen') ? (
              <button
                type="button"
                className={styles.primary}
                disabled={sending}
                onClick={() => void runMutation(() => sendToKitchen(current.id))}
              >
                Enviar a cocina
              </button>
            ) : null}
            {can(current, 'cancel') && !confirmCancel ? (
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  setNotice(null);
                  setConfirmCancel(true);
                }}
              >
                Cancelar orden
              </button>
            ) : null}
            {can(current, 'cancel') && confirmCancel ? (
              <div className={styles.confirmPanel} role="alertdialog" aria-labelledby="cancel-order-title">
                <p id="cancel-order-title">¿Cancelar esta orden?</p>
                <p className={styles.hint}>
                  Se anula la comanda completa. Esta acción no se puede deshacer.
                </p>
                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={sending}
                    onClick={() => void runMutation(() => cancelOrder(current.id))}
                  >
                    Sí, cancelar
                  </button>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => setConfirmCancel(false)}
                  >
                    No, volver
                  </button>
                </div>
              </div>
            ) : null}
            {current.status === 'IN_KITCHEN' ? (
              <p className={styles.lockNotice} role="status">
                Pedido actualmente en cocción
              </p>
            ) : null}
          </div>
        </section>

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
              <fieldset className={styles.checkList}>
                <legend>Modificadores</legend>
                {selectedDish.modifiers.map((modifier) => (
                  <label key={modifier.id} className={styles.checkRow}>
                    <input
                      type="checkbox"
                      checked={modifierIds.includes(modifier.id)}
                      disabled={sending}
                      onChange={(event) => {
                        setModifierIds((current) =>
                          event.target.checked
                            ? [...current, modifier.id]
                            : current.filter((id) => id !== modifier.id),
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
    </main>
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

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { openOrder, OrderApiError } from '../../ordenes/order-api';
import { orderDetailPath } from './order-routes';
import { errorText } from '../../ordenes/order-view';
import styles from './app-shell.module.css';
import { useShell } from './shell-context';

type OriginKind = 'table' | 'external';

export function AddOrderDialog() {
  const router = useRouter();
  const { addOrderOpen, closeAddOrder, bumpRefresh } = useShell();
  const [originKind, setOriginKind] = useState<OriginKind>('table');
  const [originValue, setOriginValue] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!addOrderOpen) {
      return;
    }
    setOriginKind('table');
    setOriginValue('');
    setNotice(null);
    setSending(false);
  }, [addOrderOpen]);

  if (!addOrderOpen) {
    return null;
  }

  async function onSubmit() {
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
      bumpRefresh();
      closeAddOrder();
      router.push(orderDetailPath(created.id));
    } catch (error) {
      setNotice(errorText(error));
      if (error instanceof OrderApiError && error.code === 'ExternalOrderIdInUseError') {
        bumpRefresh();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={styles.dialogBackdrop}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !sending) {
          closeAddOrder();
        }
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-order-title"
      >
        <h2 id="add-order-title">Nueva orden</h2>
        <form
          className={styles.dialogForm}
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
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
            {originKind === 'table' ? 'Mesa' : 'ID externo'}
            <input
              value={originValue}
              disabled={sending}
              autoComplete="off"
              autoFocus
              onChange={(event) => setOriginValue(event.target.value)}
            />
          </label>
          {notice ? (
            <p className={styles.dialogNotice} role="alert">
              {notice}
            </p>
          ) : null}
          <div className={styles.dialogActions}>
            <button
              type="button"
              className={styles.dialogCancel}
              disabled={sending}
              onClick={closeAddOrder}
            >
              Cancelar
            </button>
            <button type="submit" className={styles.addOrder} disabled={sending}>
              Abrir comanda
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

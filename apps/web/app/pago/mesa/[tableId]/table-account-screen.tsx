'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { orderCuentaPath } from '../../../components/app-shell/order-routes';
import { EmptyState } from '../../../components/ui/empty-state';
import { basisPointsToPercentLabel, centavosToLabel } from '../../../menu/menu-amount';
import { OrderApiError } from '../../../ordenes/order-api';
import { errorText, statusLabel } from '../../../ordenes/order-view';
import {
  acceptAccount,
  clearAccountAccepted,
  isAccountAccepted,
} from '../../../ordenes/[orderId]/cuenta/account-accepted';
import { TIP_PRESETS, taxLabel, tipLabel } from '../../../ordenes/[orderId]/cuenta/totals-view';
import styles from '../../pago.module.css';
import {
  getTableAccount,
  setTableBillingMode,
  setTableTip,
  tableBillKey,
  tableCobroPath,
  type TableAccountJson,
} from '../table-account-api';

type Load =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; account: TableAccountJson };

export function TableAccountScreen({ tableId }: { tableId: string }) {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [tipText, setTipText] = useState('10');
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [accepted, setAccepted] = useState(false);

  async function reload() {
    const account = await getTableAccount(tableId);
    if (account.orders.length === 1) {
      router.replace(orderCuentaPath(account.orders[0].id));
      return;
    }
    setLoad({ kind: 'ready', account });
    setAccepted(isAccountAccepted(tableBillKey(tableId, account.orders.map((order) => order.id))));
  }

  useEffect(() => {
    let cancelled = false;
    setLoad({ kind: 'loading' });
    void getTableAccount(tableId)
      .then((account) => {
        if (cancelled) {
          return;
        }
        if (account.orders.length === 1) {
          router.replace(orderCuentaPath(account.orders[0].id));
          return;
        }
        setLoad({ kind: 'ready', account });
        setAccepted(isAccountAccepted(tableBillKey(tableId, account.orders.map((order) => order.id))));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoad({ kind: 'error', message: accountError(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tableId, router]);

  if (load.kind === 'loading') {
    return <p>Cargando cuenta de la mesa…</p>;
  }
  if (load.kind === 'error') {
    return <p role="alert">{load.message}</p>;
  }

  const account = load.account;
  const combined = account.billingMode === 'combined';

  async function toggleMode() {
    setSending(true);
    setNotice(null);
    try {
      const next = await setTableBillingMode(tableId, combined ? 'separate' : 'combined');
      setLoad({ kind: 'ready', account: next });
      clearAccountAccepted(tableBillKey(tableId, next.orders.map((order) => order.id)));
      setAccepted(false);
    } catch (error) {
      setNotice(accountError(error));
    } finally {
      setSending(false);
    }
  }

  async function applyTip(basisPoints: number | null) {
    if (basisPoints !== null && (basisPoints <= 0 || basisPoints > 10000)) {
      setNotice('La propina es un porcentaje entre 0 y 100.');
      return;
    }
    setSending(true);
    setNotice(null);
    try {
      const next = await setTableTip(
        tableId,
        basisPoints === null ? null : { kind: 'percentage', basisPoints },
      );
      setLoad({ kind: 'ready', account: next });
      clearAccountAccepted(tableBillKey(tableId, next.orders.map((order) => order.id)));
      setAccepted(false);
    } catch (error) {
      setNotice(accountError(error));
    } finally {
      setSending(false);
    }
  }

  function applyTypedTip() {
    const percent = Number(tipText.replace(',', '.'));
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      setNotice('La propina es un porcentaje entre 0 y 100.');
      return;
    }
    void applyTip(Math.round(percent * 100));
  }

  const billKey = tableBillKey(tableId, account.orders.map((order) => order.id));
  const totals = account.totals;
  const tipBasisPoints = totals?.tip?.kind === 'percentage' ? totals.tip.basisPoints : null;
  const totalQuantity = totals?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.lead}>
          <h1>Mesa {tableId}</h1>
          <p className={styles.hint}>
            {account.orders.length} {account.orders.length === 1 ? 'comanda' : 'comandas'}
            {combined ? ' · una sola cuenta' : ' · cada comanda se cobra aparte'}
          </p>
        </div>
        <div className={styles.navChips}>
          <button type="button" className={styles.ghost} disabled={sending} onClick={() => void toggleMode()}>
            {combined ? 'Cuentas separadas' : 'Juntar cuentas'}
          </button>
          <button
            type="button"
            className={styles.ghost}
            disabled={sending}
            onClick={() => void reload().catch((error: unknown) => setNotice(accountError(error)))}
          >
            Actualizar
          </button>
        </div>
      </header>

      {notice ? (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      ) : null}

      {account.orders.length === 0 ? <EmptyState text="Esta mesa no tiene comandas abiertas" /> : null}

      {account.orders.length > 0 ? (
        <ul className={styles.comandas} aria-label="Comandas de la mesa">
          {account.orders.map((order, index) => (
            <li key={order.id} className={styles.comanda}>
              <div>
                <h2>Comanda {index + 1}</h2>
                <p className={styles.comandaStatus}>{statusLabel(order.status)}</p>
                <p>{dishSummary(order.lines)}</p>
              </div>
              {combined ? null : (
                <Link className={styles.solid} href={orderCuentaPath(order.id)}>
                  Cobrar esta
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {combined && totals !== null ? (
        <>
          <ul className={styles.rows} aria-label="Platillos de la cuenta">
            {totals.lines.map((line) => (
              <li key={line.lineId} className={styles.pill}>
                <span className={styles.pillName}>{line.name}</span>
                <span className={styles.pillQty}>
                  <span className={styles.pillLabel}>Cantidad</span>
                  {line.quantity}
                </span>
                <span className={styles.pillAmount}>{centavosToLabel(line.lineSubtotal.amount)}</span>
              </li>
            ))}
            <li className={`${styles.pill} ${styles.pillTotal}`}>
              <span className={styles.pillName}>Subtotal</span>
              <span className={styles.pillQty}>
                <span className={styles.pillLabel}>Cantidad</span>
                {totalQuantity}
              </span>
              <span className={styles.pillAmount}>{centavosToLabel(totals.subtotal.amount)}</span>
            </li>
          </ul>

          <dl className={styles.receipt} aria-label="Desglose">
            {totals.discount !== null ? (
              <div className={styles.receiptRow}>
                <dt>Descuento</dt>
                <dd>{centavosToLabel(totals.discount.amount.amount)}</dd>
              </div>
            ) : null}
            {totals.taxes.length === 0 ? (
              <div className={styles.receiptRow}>
                <dt>Impuestos</dt>
                <dd>{centavosToLabel(totals.taxTotal.amount)}</dd>
              </div>
            ) : (
              totals.taxes.map((tax) => (
                <div key={tax.basisPoints} className={styles.receiptRow}>
                  <dt>{taxLabel(tax)}</dt>
                  <dd>{centavosToLabel(tax.amount.amount)}</dd>
                </div>
              ))
            )}
            <div className={styles.receiptRow}>
              <dt>{totals.tip === null ? 'Propina' : tipLabel(totals.tip)}</dt>
              <dd>{totals.tip === null ? '—' : centavosToLabel(totals.tip.amount.amount)}</dd>
            </div>
            <div className={`${styles.receiptRow} ${styles.receiptTotal}`}>
              <dt>Total</dt>
              <dd>{centavosToLabel(totals.total.amount)}</dd>
            </div>
          </dl>

          <div className={styles.cards}>
            {account.adjustable && !accepted ? (
              <form
                className={styles.sectionCard}
                onSubmit={(event) => {
                  event.preventDefault();
                  applyTypedTip();
                }}
              >
                <h2>Propina de la mesa</h2>
                <div className={styles.chips} role="group" aria-label="Propina">
                  <button
                    type="button"
                    className={tipBasisPoints === null ? styles.chipActive : styles.chip}
                    aria-pressed={tipBasisPoints === null}
                    disabled={sending}
                    onClick={() => void applyTip(null)}
                  >
                    Sin propina
                  </button>
                  {TIP_PRESETS.map((basisPoints) => (
                    <button
                      key={basisPoints}
                      type="button"
                      className={tipBasisPoints === basisPoints ? styles.chipActive : styles.chip}
                      aria-pressed={tipBasisPoints === basisPoints}
                      disabled={sending}
                      onClick={() => void applyTip(basisPoints)}
                    >
                      {basisPointsToPercentLabel(basisPoints)}
                    </button>
                  ))}
                </div>
                <label className={styles.field}>
                  Otro porcentaje
                  <input
                    value={tipText}
                    inputMode="decimal"
                    disabled={sending}
                    onChange={(event) => setTipText(event.target.value)}
                  />
                </label>
                <button type="submit" className={styles.solid} disabled={sending}>
                  Aplicar propina
                </button>
              </form>
            ) : null}

            {account.canClose && !accepted ? (
              <div className={styles.confirmCard}>
                <p>Revisa el monto. Cuando esté listo, acepta la cuenta para cobrar.</p>
                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    className={styles.solid}
                    disabled={sending}
                    onClick={() => {
                      acceptAccount(billKey);
                      setAccepted(true);
                    }}
                  >
                    Aceptar cuenta {centavosToLabel(totals.total.amount)}
                  </button>
                </div>
              </div>
            ) : null}

            {account.canClose && accepted ? (
              <div className={styles.confirmCard}>
                <p className={styles.lockText}>
                  Cuenta aceptada por {centavosToLabel(totals.total.amount)}. Elige el medio de pago.
                </p>
                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    className={styles.ghost}
                    disabled={sending}
                    onClick={() => {
                      clearAccountAccepted(billKey);
                      setAccepted(false);
                    }}
                  >
                    Editar
                  </button>
                  <Link className={styles.solidNavy} href={tableCobroPath(tableId)}>
                    Ir a cobrar
                  </Link>
                </div>
              </div>
            ) : null}

            {!account.canClose ? (
              <div className={styles.lockNotice}>
                <p className={styles.lockText}>
                  Se cobra la cuenta junta cuando todas las comandas están listas.
                </p>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function dishSummary(lines: { name: string; quantity: number }[]): string {
  if (lines.length === 0) {
    return 'Sin platillos';
  }
  return lines.map((line) => `${line.quantity} ${line.name}`).join(', ');
}

function accountError(error: unknown): string {
  if (error instanceof OrderApiError) {
    return errorText(error);
  }
  return errorText(error);
}

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { orderCobroPath, orderDetailPath } from '../../../components/app-shell/order-routes';
import { useShell } from '../../../components/app-shell/shell-context';
import { basisPointsToPercentLabel, centavosToLabel } from '../../../menu/menu-amount';
import { getOrder, OrderApiError } from '../../order-api';
import { can, originLabel, statusLabel } from '../../order-view';
import styles from '../../orders.module.css';
import {
  acceptAccount,
  clearAccountAccepted,
  isAccountAccepted,
} from './account-accepted';
import {
  getOrderTotals,
  setOrderDiscount,
  setOrderTip,
  type OrderTotalsJson,
} from './totals-api';
import {
  discountCapNotice,
  discountLabel,
  parseAdjustment,
  taxLabel,
  tipLabel,
  TIP_PRESETS,
  totalsErrorText,
  totalsView,
  type TotalsStatus,
} from './totals-view';

type AdjustmentMode = 'none' | 'percentage' | 'fixedAmount';

type Props = {
  orderId: string;
};

export function TotalsScreen({ orderId }: Props) {
  const { bumpRefresh, setSelectedOrderId } = useShell();
  const [status, setStatus] = useState<TotalsStatus>({ kind: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [discountMode, setDiscountMode] = useState<AdjustmentMode>('none');
  const [discountText, setDiscountText] = useState('');
  const [tipMode, setTipMode] = useState<AdjustmentMode>('none');
  const [tipText, setTipText] = useState('');
  const [accountLocked, setAccountLocked] = useState(false);

  function syncForms(next: OrderTotalsJson) {
    if (next.discount === null) {
      setDiscountMode('none');
      setDiscountText('');
    } else if (next.discount.kind === 'percentage') {
      setDiscountMode('percentage');
      setDiscountText(
        basisPointsToPercentLabel(next.discount.basisPoints).replace(/ %$/, ''),
      );
    } else {
      setDiscountMode('fixedAmount');
      setDiscountText(centavosToLabel(next.discount.requested.amount).slice(1));
    }

    if (next.tip === null) {
      setTipMode('none');
      setTipText('');
    } else if (next.tip.kind === 'percentage') {
      setTipMode('percentage');
      setTipText(basisPointsToPercentLabel(next.tip.basisPoints).replace(/ %$/, ''));
    } else {
      setTipMode('fixedAmount');
      setTipText(centavosToLabel(next.tip.amount.amount).slice(1));
    }
  }

  useEffect(() => {
    setSelectedOrderId(orderId);
    setAccountLocked(isAccountAccepted(orderId));
    void loadAccount(orderId, setStatus, setNotice, syncForms);
  }, [orderId, setSelectedOrderId]);

  const view = totalsView(status);

  if (view === 'loading') {
    return (
      <div className={styles.page}>
        <p>Cargando cuenta…</p>
      </div>
    );
  }

  if (view === 'missing') {
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

  if (view === 'error' && status.kind === 'error') {
    return (
      <div className={styles.page}>
        <div className={styles.error} role="alert">
          <p>{totalsErrorText(status.error)}</p>
          <button
            type="button"
            disabled={sending}
            onClick={() => void loadAccount(orderId, setStatus, setNotice, syncForms)}
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

  if (status.kind !== 'ready') {
    return null;
  }

  const { order, totals } = status;
  const capNotice = discountCapNotice(totals);
  const readyToCharge = can(order, 'close') || order.status === 'READY';
  const showAdjustmentForms = totals.adjustable && !accountLocked;

  function lockAccount() {
    acceptAccount(orderId);
    setAccountLocked(true);
    setNotice(null);
  }

  function unlockAccount() {
    clearAccountAccepted(orderId);
    setAccountLocked(false);
    setNotice(null);
  }

  async function runAdjustment(action: () => Promise<OrderTotalsJson>) {
    setSending(true);
    setNotice(null);
    try {
      const next = await action();
      setStatus({ kind: 'ready', order, totals: next });
      syncForms(next);
      bumpRefresh();
    } catch (error) {
      setNotice(totalsErrorText(error));
      if (error instanceof OrderApiError && error.status === 409) {
        await loadAccount(orderId, setStatus, setNotice, syncForms, false);
        bumpRefresh();
      }
    } finally {
      setSending(false);
    }
  }

  async function applyDiscount() {
    if (discountMode === 'none') {
      await runAdjustment(() => setOrderDiscount(orderId, null));
      return;
    }

    const parsed = parseAdjustment(discountMode, discountText);
    if (!parsed.ok) {
      setNotice(parsed.message);
      return;
    }

    await runAdjustment(() => setOrderDiscount(orderId, parsed.value));
  }

  async function applyTip() {
    if (tipMode === 'none') {
      await runAdjustment(() => setOrderTip(orderId, null));
      return;
    }

    const parsed = parseAdjustment(tipMode, tipText);
    if (!parsed.ok) {
      setNotice(parsed.message);
      return;
    }

    await runAdjustment(() => setOrderTip(orderId, parsed.value));
  }

  async function applyTipPreset(basisPoints: number) {
    setTipMode('percentage');
    setTipText(basisPointsToPercentLabel(basisPoints).replace(/ %$/, ''));
    await runAdjustment(() =>
      setOrderTip(orderId, { kind: 'percentage', basisPoints }),
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>
            {originLabel(order)} · Cuenta
          </h1>
          <p className={styles.meta}>
            <span className={styles.statusBadge}>{statusLabel(order.status)}</span>
          </p>
        </div>
        <nav className={styles.nav} aria-label="Acciones de cuenta">
          <Link href="/pago">Cola de pago</Link>
          <Link href={orderDetailPath(orderId)}>Comanda</Link>
        </nav>
      </header>

      {notice ? (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      ) : null}

      <div className={styles.workspace}>
        <section className={styles.panel} aria-label="Desglose de la cuenta">
              <table className={styles.breakdown}>
                <tbody>
                  {totals.lines.map((line) => (
                    <tr key={line.lineId}>
                      <th scope="row">
                        {line.name}
                        <span className={styles.meta}> × {line.quantity}</span>
                      </th>
                      <td>{centavosToLabel(line.lineSubtotal.amount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">Subtotal</th>
                    <td>{centavosToLabel(totals.subtotal.amount)}</td>
                  </tr>
                  {totals.discount !== null ? (
                    <tr>
                      <th scope="row">{discountLabel(totals.discount)}</th>
                      <td>−{centavosToLabel(totals.discount.amount.amount)}</td>
                    </tr>
                  ) : null}
                  {totals.taxes.map((tax) => (
                    <tr key={`tax-${tax.basisPoints}`}>
                      <th scope="row">{taxLabel(tax)}</th>
                      <td>{centavosToLabel(tax.amount.amount)}</td>
                    </tr>
                  ))}
                  {totals.tip !== null ? (
                    <tr>
                      <th scope="row">{tipLabel(totals.tip)}</th>
                      <td>{centavosToLabel(totals.tip.amount.amount)}</td>
                    </tr>
                  ) : null}
                  <tr className={styles.breakdownTotal}>
                    <th scope="row">Total</th>
                    <td>{centavosToLabel(totals.total.amount)}</td>
                  </tr>
                </tbody>
              </table>
              {capNotice ? (
                <p className={styles.hint} role="status">
                  {capNotice}
                </p>
              ) : null}
        </section>

        {showAdjustmentForms ? (
          <div className={styles.formsStack}>
            {readyToCharge ? (
              <div className={styles.confirmPanel}>
                <p className={styles.hint}>
                  Aplica descuento y propina. Cuando esté lista, acepta la cuenta para cobrar.
                </p>
                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={sending}
                    onClick={lockAccount}
                  >
                    Aceptar cuenta
                  </button>
                </div>
              </div>
            ) : null}

            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                void applyDiscount();
              }}
            >
              <h2>Descuento</h2>
              <div className={styles.segmented} role="group" aria-label="Tipo de descuento">
                <button
                  type="button"
                  className={discountMode === 'none' ? styles.segmentActive : styles.segment}
                  aria-pressed={discountMode === 'none'}
                  disabled={sending}
                  onClick={() => {
                    setDiscountMode('none');
                    setDiscountText('');
                  }}
                >
                  Sin descuento
                </button>
                <button
                  type="button"
                  className={discountMode === 'percentage' ? styles.segmentActive : styles.segment}
                  aria-pressed={discountMode === 'percentage'}
                  disabled={sending}
                  onClick={() => setDiscountMode('percentage')}
                >
                  Porcentaje
                </button>
                <button
                  type="button"
                  className={discountMode === 'fixedAmount' ? styles.segmentActive : styles.segment}
                  aria-pressed={discountMode === 'fixedAmount'}
                  disabled={sending}
                  onClick={() => setDiscountMode('fixedAmount')}
                >
                  Monto fijo
                </button>
              </div>
              {discountMode !== 'none' ? (
                <label>
                  {discountMode === 'percentage' ? 'Porcentaje' : 'Monto en pesos'}
                  <input
                    value={discountText}
                    disabled={sending}
                    onChange={(event) => setDiscountText(event.target.value)}
                    inputMode="decimal"
                  />
                </label>
              ) : null}
              <button type="submit" className={styles.primary} disabled={sending}>
                Aplicar
              </button>
            </form>

            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                void applyTip();
              }}
            >
              <h2>Propina</h2>
              <div className={styles.segmented} role="group" aria-label="Tipo de propina">
                <button
                  type="button"
                  className={tipMode === 'none' ? styles.segmentActive : styles.segment}
                  aria-pressed={tipMode === 'none'}
                  disabled={sending}
                  onClick={() => {
                    setTipMode('none');
                    setTipText('');
                  }}
                >
                  Sin propina
                </button>
                <button
                  type="button"
                  className={tipMode === 'percentage' ? styles.segmentActive : styles.segment}
                  aria-pressed={tipMode === 'percentage'}
                  disabled={sending}
                  onClick={() => setTipMode('percentage')}
                >
                  Otro %
                </button>
                <button
                  type="button"
                  className={tipMode === 'fixedAmount' ? styles.segmentActive : styles.segment}
                  aria-pressed={tipMode === 'fixedAmount'}
                  disabled={sending}
                  onClick={() => setTipMode('fixedAmount')}
                >
                  Monto fijo
                </button>
              </div>
              <div className={styles.presetRow} role="group" aria-label="Atajos de propina">
                {TIP_PRESETS.map((basisPoints) => {
                  const label = basisPointsToPercentLabel(basisPoints);
                  const selected =
                    tipMode === 'percentage' &&
                    tipText === label.replace(/ %$/, '');
                  return (
                    <button
                      key={basisPoints}
                      type="button"
                      className={selected ? styles.segmentActive : styles.segment}
                      aria-pressed={selected}
                      disabled={sending}
                      onClick={() => void applyTipPreset(basisPoints)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {tipMode !== 'none' ? (
                <label>
                  {tipMode === 'percentage' ? 'Porcentaje' : 'Monto en pesos'}
                  <input
                    value={tipText}
                    disabled={sending}
                    onChange={(event) => setTipText(event.target.value)}
                    inputMode="decimal"
                  />
                </label>
              ) : null}
              <button type="submit" className={styles.primary} disabled={sending}>
                Aplicar
              </button>
            </form>
          </div>
        ) : (
          <div className={styles.confirmPanel}>
            <p className={styles.lockNotice} role="status">
              {order.status === 'CLOSED'
                ? 'La cuenta ya no se puede ajustar'
                : accountLocked
                  ? 'Cuenta aceptada. Ya no se puede modificar el descuento ni la propina.'
                  : 'La cuenta ya no se puede ajustar'}
            </p>
            {readyToCharge || order.status === 'CLOSED' ? (
              <div className={styles.confirmActions}>
                {accountLocked && order.status !== 'CLOSED' ? (
                  <button type="button" disabled={sending} onClick={unlockAccount}>
                    Editar
                  </button>
                ) : null}
                <Link
                  className={styles.primary}
                  href={orderCobroPath(orderId)}
                >
                  {order.status === 'CLOSED' ? 'Ver cobro' : 'Ir a cobrar'}
                </Link>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

async function loadAccount(
  orderId: string,
  setStatus: (status: TotalsStatus) => void,
  setNotice: (notice: string | null) => void,
  syncForms: (totals: OrderTotalsJson) => void,
  resetNotice = true,
): Promise<void> {
  setStatus({ kind: 'loading' });
  if (resetNotice) {
    setNotice(null);
  }

  const [orderResult, totalsResult] = await Promise.allSettled([
    getOrder(orderId),
    getOrderTotals(orderId),
  ]);

  const orderMissing =
    orderResult.status === 'rejected' &&
    orderResult.reason instanceof OrderApiError &&
    orderResult.reason.status === 404;
  const totalsMissing =
    totalsResult.status === 'rejected' &&
    totalsResult.reason instanceof OrderApiError &&
    totalsResult.reason.status === 404;

  if (orderMissing || totalsMissing) {
    setStatus({ kind: 'missing' });
    return;
  }

  if (orderResult.status === 'rejected') {
    setStatus({ kind: 'error', error: orderResult.reason });
    return;
  }

  if (totalsResult.status === 'rejected') {
    setStatus({ kind: 'error', error: totalsResult.reason });
    return;
  }

  setStatus({ kind: 'ready', order: orderResult.value, totals: totalsResult.value });
  syncForms(totalsResult.value);
}

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { orderCobroPath } from '../../../components/app-shell/order-routes';
import { useShell } from '../../../components/app-shell/shell-context';
import { basisPointsToPercentLabel, centavosToLabel } from '../../../menu/menu-amount';
import { getOrder, OrderApiError } from '../../order-api';
import { can } from '../../order-view';
import styles from '../../../pago/pago.module.css';
import { EmptyState } from '../../../components/ui/empty-state';
import { Tabs } from '../../../components/ui/tabs';
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

    const totalQuantity = totals.lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Gestión de pagos</h1>
        <nav className={styles.navChips} aria-label="Acciones de cuenta">
          <Link href="/pago" className={styles.navChip}>
            Cola de pago
          </Link>
        </nav>
      </header>

      <Tabs
        label="Secciones de la cuenta"
        value="products"
        onChange={() => undefined}
        items={[{ value: 'products', label: 'Productos', count: totals.lines.length }]}
      />

      {notice ? (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      ) : null}

      {showAdjustmentForms ? (
        <div className={styles.cards}>
          <form
            className={styles.sectionCard}
            onSubmit={(event) => {
              event.preventDefault();
              void applyDiscount();
            }}
          >
            <h2>Descuentos</h2>
            <div className={styles.chips} role="group" aria-label="Tipo de descuento">
              <button
                type="button"
                className={discountMode === 'none' ? styles.chipActive : styles.chip}
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
                className={discountMode === 'percentage' ? styles.chipActive : styles.chip}
                aria-pressed={discountMode === 'percentage'}
                disabled={sending}
                onClick={() => setDiscountMode('percentage')}
              >
                Porcentaje
              </button>
              <button
                type="button"
                className={discountMode === 'fixedAmount' ? styles.chipActive : styles.chip}
                aria-pressed={discountMode === 'fixedAmount'}
                disabled={sending}
                onClick={() => setDiscountMode('fixedAmount')}
              >
                Monto fijo
              </button>
            </div>
            {discountMode !== 'none' ? (
              <label className={styles.field}>
                {discountMode === 'percentage' ? 'Porcentaje' : 'Monto en pesos'}
                <input
                  value={discountText}
                  disabled={sending}
                  onChange={(event) => setDiscountText(event.target.value)}
                  inputMode="decimal"
                />
              </label>
            ) : null}
            <button type="submit" className={styles.solid} disabled={sending}>
              Aplicar descuento
            </button>
          </form>

          <form
            className={styles.sectionCard}
            onSubmit={(event) => {
              event.preventDefault();
              void applyTip();
            }}
          >
            <h2>Propinas</h2>
            <div className={styles.chips} role="group" aria-label="Tipo de propina">
              <button
                type="button"
                className={tipMode === 'none' ? styles.chipActive : styles.chip}
                aria-pressed={tipMode === 'none'}
                disabled={sending}
                onClick={() => {
                  setTipMode('none');
                  setTipText('');
                }}
              >
                Sin propina
              </button>
              {TIP_PRESETS.map((basisPoints) => {
                const label = basisPointsToPercentLabel(basisPoints);
                const selected =
                  tipMode === 'percentage' && tipText === label.replace(/ %$/, '');
                return (
                  <button
                    key={basisPoints}
                    type="button"
                    className={selected ? styles.chipActive : styles.chip}
                    aria-pressed={selected}
                    disabled={sending}
                    onClick={() => void applyTipPreset(basisPoints)}
                  >
                    {label}
                  </button>
                );
              })}
              <button
                type="button"
                className={tipMode === 'percentage' ? styles.chipActive : styles.chip}
                aria-pressed={tipMode === 'percentage'}
                disabled={sending}
                onClick={() => setTipMode('percentage')}
              >
                Otro %
              </button>
              <button
                type="button"
                className={tipMode === 'fixedAmount' ? styles.chipActive : styles.chip}
                aria-pressed={tipMode === 'fixedAmount'}
                disabled={sending}
                onClick={() => setTipMode('fixedAmount')}
              >
                Monto fijo
              </button>
            </div>
            {tipMode !== 'none' ? (
              <label className={styles.field}>
                {tipMode === 'percentage' ? 'Porcentaje' : 'Monto en pesos'}
                <input
                  value={tipText}
                  disabled={sending}
                  onChange={(event) => setTipText(event.target.value)}
                  inputMode="decimal"
                />
              </label>
            ) : null}
            <button type="submit" className={styles.solid} disabled={sending}>
              Aplicar propina
            </button>
          </form>
        </div>
      ) : null}

      {capNotice ? (
        <p className={styles.hint} role="status">
          {capNotice}
        </p>
      ) : null}

      <ul className={styles.rows} aria-label="Productos de la cuenta">
        {totals.lines.map((line) => (
          <li key={line.lineId} className={styles.pill}>
            <span className={styles.pillName}>{line.name}</span>
            <span className={styles.pillQty}>
              <span className={styles.pillLabel}>Cantidad</span>
              {line.quantity}
            </span>
            <span className={styles.pillAmount}>
              {centavosToLabel(line.lineSubtotal.amount)}
            </span>
          </li>
        ))}
        <li className={`${styles.pill} ${styles.pillTotal}`}>
          <span className={styles.pillName}>Subtotal:</span>
          <span className={styles.pillQty}>
            <span className={styles.pillLabel}>Cantidad</span>
            {totalQuantity}
          </span>
          <span className={styles.pillAmount}>{centavosToLabel(totals.subtotal.amount)}</span>
        </li>
      </ul>

      {showAdjustmentForms && readyToCharge ? (
        <div className={styles.confirmCard}>
          <p>Aplica descuento y propina. Cuando esté lista, acepta la cuenta para cobrar.</p>
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.solid}
              disabled={sending}
              onClick={lockAccount}
            >
              Aceptar cuenta
            </button>
          </div>
        </div>
      ) : null}

      {!showAdjustmentForms ? (
        <div className={styles.confirmCard}>
          <p className={styles.lockText} role="status">
            {order.status === 'CLOSED'
              ? 'La cuenta ya no se puede ajustar'
              : accountLocked
                ? 'Cuenta aceptada. Ya no se puede modificar el descuento ni la propina.'
                : 'La cuenta ya no se puede ajustar'}
          </p>
          {readyToCharge || order.status === 'CLOSED' ? (
            <div className={styles.confirmActions}>
              {accountLocked && order.status !== 'CLOSED' ? (
                <button
                  type="button"
                  className={styles.ghost}
                  disabled={sending}
                  onClick={unlockAccount}
                >
                  Editar
                </button>
              ) : null}
              <Link className={styles.solidNavy} href={orderCobroPath(orderId)}>
                {order.status === 'CLOSED' ? 'Ver cobro' : 'Ir a cobrar'}
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
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

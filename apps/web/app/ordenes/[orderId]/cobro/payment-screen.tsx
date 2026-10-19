'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { orderCuentaPath, orderDetailPath } from '../../../components/app-shell/order-routes';
import { useShell } from '../../../components/app-shell/shell-context';
import { centavosToLabel } from '../../../menu/menu-amount';
import { getOrder, OrderApiError } from '../../order-api';
import styles from '../../../pago/pago.module.css';
import { Tabs } from '../../../components/ui/tabs';
import { isAccountAccepted } from '../cuenta/account-accepted';
import { getOrderTotals } from '../cuenta/totals-api';
import {
  closeOrder,
  getOrderPayment,
  type PaymentBody,
  type PaymentJson,
  type PaymentMethodJson,
} from './payment-api';
import {
  PAYMENT_METHODS,
  confirmationText,
  parsePaymentInput,
  paymentErrorText,
  paymentView,
  receiptRows,
  type PaymentStatus,
} from './payment-view';

type Step = 'capture' | 'confirm';

type Props = {
  orderId: string;
};

export function PaymentScreen({ orderId }: Props) {
  const { bumpRefresh, setSelectedOrderId } = useShell();
  const [status, setStatus] = useState<PaymentStatus>({ kind: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [method, setMethod] = useState<PaymentMethodJson>('cash');
  const [inputText, setInputText] = useState('');
  const [step, setStep] = useState<Step>('capture');
  const [pendingPayment, setPendingPayment] = useState<PaymentBody['payment'] | null>(null);
  const [receipt, setReceipt] = useState<PaymentJson | null>(null);

  useEffect(() => {
    setSelectedOrderId(orderId);
    void loadPayment(orderId, setStatus, setNotice, setReceipt, setStep);
  }, [orderId, setSelectedOrderId]);

  const view = paymentView(status);

  if (view === 'loading') {
    return (
      <div className={styles.page}>
        <p>Cargando cobro…</p>
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
          <p>{paymentErrorText(status.error)}</p>
          <button
            type="button"
            disabled={sending}
            onClick={() =>
              void loadPayment(orderId, setStatus, setNotice, setReceipt, setStep)
            }
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
  const shownPayment = receipt ?? status.payment;
  const accountAccepted =
    order.status === 'CLOSED' || isAccountAccepted(orderId);

  async function continueToConfirm() {
    setNotice(null);
    const parsed = parsePaymentInput(method, inputText);
    if (!parsed.ok) {
      setNotice(parsed.message);
      return;
    }
    setPendingPayment(parsed.value);
    setStep('confirm');
  }

  async function confirmClose() {
    if (pendingPayment === null) {
      return;
    }

    setSending(true);
    setNotice(null);
    try {
      const closed = await closeOrder(orderId, {
        expectedTotal: totals.total.amount,
        payment: pendingPayment,
      });
      setReceipt(closed.payment);
      setStatus({
        kind: 'ready',
        order: { ...order, status: 'CLOSED', allowedActions: [] },
        totals: { ...totals, adjustable: false },
        payment: closed.payment,
      });
      setStep('capture');
      setPendingPayment(null);
      bumpRefresh();
    } catch (error) {
      setNotice(paymentErrorText(error));
      setStep('capture');

      if (!(error instanceof OrderApiError)) {
        return;
      }

      if (
        error.status === 409 ||
        error.code === 'PaymentAmountMismatchError' ||
        error.code === 'OrderNotClosableError' ||
        error.code === 'OrderConcurrencyError'
      ) {
        await loadPayment(orderId, setStatus, setNotice, setReceipt, setStep, false);
      }
    } finally {
      setSending(false);
    }
  }

  function selectMethod(next: PaymentMethodJson) {
    setMethod(next);
    setInputText('');
    setNotice(null);
    setStep('capture');
    setPendingPayment(null);
  }

    return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Gestión de pagos</h1>
        <nav className={styles.navChips} aria-label="Acciones de cobro">
          <Link href={orderDetailPath(orderId)} className={styles.navChip}>
            Comanda
          </Link>
          <Link href={orderCuentaPath(orderId)} className={styles.navChip}>
            Cuenta
          </Link>
          <Link href="/pago" className={styles.navChip}>
            Cola de pago
          </Link>
        </nav>
      </header>

      <Tabs
        label="Secciones del cobro"
        value="products"
        onChange={() => undefined}
        items={[{ value: 'products', label: 'Productos', count: totals.lines.length }]}
      />

      {notice ? (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      ) : null}

      {view === 'closed' && shownPayment !== null ? (
        <section className={styles.receipt} aria-label="Comprobante de cobro">
          <h2>Orden cerrada</h2>
          <dl className={styles.receiptList}>
            {receiptRows(shownPayment).map((row) => (
              <div key={row.label} className={styles.receiptRow}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {view === 'cancelled' ? (
        <p className={styles.lockNotice} role="status">
          Esta orden está cancelada. No se cobra.
        </p>
      ) : null}

      {view === 'notReady' ? (
        <div className={styles.lockNotice} role="status">
          <p>Se cobra cuando cocina marca la orden como lista.</p>
          <p>
            <Link href={orderDetailPath(orderId)}>Ir a la comanda</Link>
          </p>
        </div>
      ) : null}

      {view === 'payable' && !accountAccepted ? (
        <div className={styles.lockNotice} role="status">
          <p>Primero acepta la cuenta (descuento y propina) para poder cobrar.</p>
          <p>
            <Link href={orderCuentaPath(orderId)}>Ir a la cuenta</Link>
          </p>
        </div>
      ) : null}

      {view === 'payable' && accountAccepted && step === 'capture' ? (
        <form
          className={`${styles.sectionCard} ${styles.narrow}`}
          onSubmit={(event) => {
            event.preventDefault();
            void continueToConfirm();
          }}
        >
          <h2>Medio de pago</h2>
          <div className={styles.chips} role="group" aria-label="Medio de pago">
            {PAYMENT_METHODS.map((entry) => (
              <button
                key={entry.method}
                type="button"
                className={method === entry.method ? styles.chipActive : styles.chip}
                aria-pressed={method === entry.method}
                disabled={sending}
                onClick={() => selectMethod(entry.method)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {method === 'cash' ? (
            <>
              <label className={styles.field}>
                Monto recibido
                <input
                  value={inputText}
                  disabled={sending}
                  onChange={(event) => setInputText(event.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                />
              </label>
              <div className={styles.chips}>
                <button
                  type="button"
                  className={styles.chip}
                  disabled={sending}
                  onClick={() =>
                    setInputText(centavosToLabel(totals.total.amount).slice(1))
                  }
                >
                  Monto exacto
                </button>
              </div>
            </>
          ) : null}

          {method === 'card' ? (
            <label className={styles.field}>
              Últimos 4 dígitos
              <input
                value={inputText}
                disabled={sending}
                onChange={(event) =>
                  setInputText(event.target.value.replace(/\D/g, '').slice(0, 4))
                }
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
              />
            </label>
          ) : null}

          {method === 'digitalGateway' ? (
            <label className={styles.field}>
              Correo o teléfono del cliente
              <input
                value={inputText}
                disabled={sending}
                onChange={(event) => setInputText(event.target.value)}
                autoComplete="off"
              />
            </label>
          ) : null}

          <button type="submit" className={styles.solid} disabled={sending}>
            Continuar
          </button>
        </form>
      ) : null}

      {view === 'payable' &&
      accountAccepted &&
      step === 'confirm' &&
      pendingPayment !== null ? (
        <div className={`${styles.confirmCard} ${styles.narrow}`}>
          <p>{confirmationText(method, totals.total, pendingPayment)}</p>
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.solidNavy}
              disabled={sending}
              onClick={() => void confirmClose()}
            >
              Confirmar cobro
            </button>
            <button
              type="button"
              className={styles.ghost}
              disabled={sending}
              onClick={() => {
                setStep('capture');
                setPendingPayment(null);
              }}
            >
              Volver
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function loadPayment(
  orderId: string,
  setStatus: (status: PaymentStatus) => void,
  setNotice: (notice: string | null) => void,
  setReceipt: (payment: PaymentJson | null) => void,
  setStep: (step: Step) => void,
  resetNotice = true,
): Promise<void> {
  setStatus({ kind: 'loading' });
  if (resetNotice) {
    setNotice(null);
  }
  setStep('capture');

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
    setReceipt(null);
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

  const order = orderResult.value;
  const totals = totalsResult.value;
  let payment: PaymentJson | null = null;

  if (order.status === 'CLOSED') {
    try {
      const closed = await getOrderPayment(orderId);
      payment = closed.payment;
      setReceipt(closed.payment);
    } catch (error) {
      setStatus({ kind: 'error', error });
      return;
    }
  } else {
    setReceipt(null);
  }

  setStatus({ kind: 'ready', order, totals, payment });
}

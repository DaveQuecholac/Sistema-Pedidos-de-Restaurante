'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { orderCuentaPath } from '../../../../components/app-shell/order-routes';
import { centavosToLabel } from '../../../../menu/menu-amount';
import { OrderApiError } from '../../../../ordenes/order-api';
import { isAccountAccepted } from '../../../../ordenes/[orderId]/cuenta/account-accepted';
import {
  PAYMENT_METHODS,
  confirmationText,
  parsePaymentInput,
  paymentErrorText,
  receiptRows,
} from '../../../../ordenes/[orderId]/cobro/payment-view';
import type { PaymentBody, PaymentJson, PaymentMethodJson } from '../../../../ordenes/[orderId]/cobro/payment-api';
import styles from '../../../pago.module.css';
import {
  closeTableAccount,
  getTableAccount,
  tableAccountPath,
  tableBillKey,
  type TableAccountJson,
} from '../../table-account-api';

type Step = 'capture' | 'confirm';

type Load =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; account: TableAccountJson };

export function TablePaymentScreen({ tableId }: { tableId: string }) {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [method, setMethod] = useState<PaymentMethodJson>('cash');
  const [inputText, setInputText] = useState('');
  const [step, setStep] = useState<Step>('capture');
  const [pendingPayment, setPendingPayment] = useState<PaymentBody['payment'] | null>(null);
  const [receipt, setReceipt] = useState<PaymentJson | null>(null);

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
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoad({ kind: 'error', message: paymentErrorText(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tableId, router]);

  if (load.kind === 'loading') {
    return (
      <div className={styles.page}>
        <p>Cargando cobro…</p>
      </div>
    );
  }
  if (load.kind === 'error') {
    return (
      <div className={styles.page}>
        <p className={styles.notice} role="alert">
          {load.message}
        </p>
      </div>
    );
  }

  const account = load.account;
  const totals = account.totals;
  const accepted =
    totals !== null &&
    isAccountAccepted(tableBillKey(tableId, account.orders.map((order) => order.id)));

  function selectMethod(next: PaymentMethodJson) {
    setMethod(next);
    setInputText('');
    setNotice(null);
    setStep('capture');
    setPendingPayment(null);
  }

  function continueToConfirm() {
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
    if (pendingPayment === null || totals === null) {
      return;
    }
    setSending(true);
    setNotice(null);
    try {
      const closed = await closeTableAccount(tableId, {
        expectedTotal: totals.total.amount,
        payment: pendingPayment,
      });
      setReceipt(closed.payment);
      setStep('capture');
      setPendingPayment(null);
    } catch (error) {
      setNotice(paymentErrorText(error));
      setStep('capture');
      if (error instanceof OrderApiError && (error.status === 409 || error.status === 404)) {
        const account = await getTableAccount(tableId);
        setLoad({ kind: 'ready', account });
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Mesa {tableId}</h1>
        <nav className={styles.navChips} aria-label="Acciones de cobro">
          <Link href={tableAccountPath(tableId)} className={styles.navChip}>
            Cuenta
          </Link>
          <Link href="/pago" className={styles.navChip}>
            Cola de pago
          </Link>
        </nav>
      </header>

      {notice ? (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      ) : null}

      {receipt !== null ? (
        <section className={styles.receipt} aria-label="Comprobante de cobro">
          <h2>Cuenta cerrada</h2>
          <dl className={styles.receiptList}>
            {receiptRows(receipt).map((row) => (
              <div key={row.label} className={styles.receiptRow}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {receipt === null && (account.billingMode !== 'combined' || totals === null) ? (
        <div className={styles.lockNotice} role="status">
          <p>Esta mesa se cobra por comanda.</p>
          <p>
            <Link href={tableAccountPath(tableId)}>Volver a la cuenta</Link>
          </p>
        </div>
      ) : null}

      {receipt === null && totals !== null && !account.canClose ? (
        <div className={styles.lockNotice} role="status">
          <p>Se cobra cuando todas las comandas están listas.</p>
          <p>
            <Link href={tableAccountPath(tableId)}>Volver a la cuenta</Link>
          </p>
        </div>
      ) : null}

      {receipt === null && totals !== null && account.canClose && !accepted ? (
        <div className={styles.lockNotice} role="status">
          <p>Primero acepta la cuenta para poder cobrar.</p>
          <p>
            <Link href={tableAccountPath(tableId)}>Ir a la cuenta</Link>
          </p>
        </div>
      ) : null}

      {receipt === null && totals !== null && account.canClose && accepted && step === 'capture' ? (
        <form
          className={`${styles.sectionCard} ${styles.narrow}`}
          onSubmit={(event) => {
            event.preventDefault();
            continueToConfirm();
          }}
        >
          <h2>Medio de pago · {centavosToLabel(totals.total.amount)}</h2>
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
                  onClick={() => setInputText(centavosToLabel(totals.total.amount).slice(1))}
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
                onChange={(event) => setInputText(event.target.value.replace(/\D/g, '').slice(0, 4))}
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

      {receipt === null &&
      totals !== null &&
      account.canClose &&
      accepted &&
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

import { eq, sql } from 'drizzle-orm';
import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChargePayment } from '../../../application/payment/charge-payment';
import { GetReceipt } from '../../../application/payment/get-receipt';
import {
  PaymentAlreadyExistsError,
  PaymentProcessorUnavailableError,
} from '../../../application/payment/payment.errors';
import { VoidPayment } from '../../../application/payment/void-payment';
import { Money } from '../../../domain/money/money';
import { Charge } from '../../../domain/payment/charge';
import { PaymentDetails } from '../../../domain/payment/payment-details';
import {
  CardPaymentAdapter,
  CashPaymentAdapter,
  DigitalGatewayFakeAdapter,
} from '../../payment';
import { type PaymentsDatabase, createPaymentsDatabase } from './client';
import { DrizzlePaymentRepository, type PaymentDatabase } from './drizzle-payment-repository';
import { payments } from './schema/payment';

const integrationOn = process.env.PAYMENTS_REPOSITORY_INTEGRATION === '1';

if (integrationOn && !process.env.PAYMENTS_DATABASE_URL) {
  throw new Error('PAYMENTS_DATABASE_URL is required');
}

const describeIntegration = integrationOn ? describe : describe.skip;

describeIntegration('payments repository', () => {
  let client: Sql;
  let db: PaymentsDatabase;

  beforeAll(() => {
    const url = process.env.PAYMENTS_DATABASE_URL;
    if (!url) {
      throw new Error('PAYMENTS_DATABASE_URL is required');
    }
    const opened = createPaymentsDatabase(url);
    client = opened.client;
    db = opened.db;
  });

  afterAll(async () => {
    await client.end();
  });

  it('P2-1 repeats an equal cash charge on the same reference and one row', async () => {
    await inTransaction(db, async (tx, repo) => {
      const subjectId = id();
      const charge = cashCharge(subjectId, 1000, 1500);
      const charges = newChargePayment(repo);

      const first = await charges.execute(charge);
      const second = await charges.execute(charge);
      const rows = await rowsFor(tx, subjectId);

      expect(first.outcome).toBe('approved');
      expect(second.outcome).toBe('approved');
      if (first.outcome === 'approved' && second.outcome === 'approved') {
        expect(second.payment.reference).toBe(first.payment.reference);
      }
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe('approved');
      expect(rows[0]?.amount).toBe(1000);
      expect(rows[0]?.tenderedAmount).toBe(1500);
    });
  });

  it('P2-2 rejects a second charge with a different amount and does not insert', async () => {
    await inTransaction(db, async (tx, repo) => {
      const subjectId = id();
      const charges = newChargePayment(repo);
      await charges.execute(cashCharge(subjectId, 1000, 1500));

      await expect(charges.execute(cashCharge(subjectId, 1200, 1500))).rejects.toBeInstanceOf(
        PaymentAlreadyExistsError,
      );

      const rows = await rowsFor(tx, subjectId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.amount).toBe(1000);
    });
  });

  it('P2-3 declines card 0002 and fails card 0119 without a row', async () => {
    await inTransaction(db, async (tx, repo) => {
      const subjectId = id();
      const charges = newChargePayment(repo);

      await expect(charges.execute(cardCharge(subjectId, '0002'))).resolves.toEqual({
        outcome: 'declined',
        reason: 'cardDeclined',
      });
      await expect(charges.execute(cardCharge(subjectId, '0119'))).rejects.toBeInstanceOf(
        PaymentProcessorUnavailableError,
      );

      expect(await rowsFor(tx, subjectId)).toHaveLength(0);
    });
  });

  it('P2-4 declines the gateway triggers without a row and approves a normal reference', async () => {
    await inTransaction(db, async (tx, repo) => {
      const declinedId = id();
      const outageId = id();
      const approvedId = id();
      const charges = newChargePayment(repo);

      await expect(charges.execute(gatewayCharge(declinedId, 'rechazo@pasarela.test'))).resolves.toEqual({
        outcome: 'declined',
        reason: 'gatewayDeclined',
      });
      await expect(charges.execute(gatewayCharge(outageId, 'caida@pasarela.test'))).rejects.toBeInstanceOf(
        PaymentProcessorUnavailableError,
      );
      const approved = await charges.execute(gatewayCharge(approvedId, 'cliente@correo.mx'));

      expect(await rowsFor(tx, declinedId)).toHaveLength(0);
      expect(await rowsFor(tx, outageId)).toHaveLength(0);
      expect(approved.outcome).toBe('approved');
      const rows = await rowsFor(tx, approvedId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe('approved');
      expect(rows[0]?.payerReference).toBe('cliente@correo.mx');
    });
  });

  it('P2-5 voids the cash reference, accepts a second void, and inserts a new approved charge', async () => {
    await inTransaction(db, async (tx, repo) => {
      const subjectId = id();
      const charges = newChargePayment(repo);
      const voids = new VoidPayment(repo);
      const first = await charges.execute(cashCharge(subjectId, 1000, 1500));
      if (first.outcome !== 'approved') {
        throw new Error('expected the cash charge to be approved');
      }

      await voids.execute(first.payment.reference);
      await expect(voids.execute(first.payment.reference)).resolves.toBeUndefined();
      const second = await charges.execute(cashCharge(subjectId, 1000, 1500));

      const rows = await rowsFor(tx, subjectId);
      expect(rows).toHaveLength(2);
      expect(rows.filter((row) => row.status === 'voided').map((row) => row.reference)).toEqual([
        first.payment.reference,
      ]);
      expect(second.outcome).toBe('approved');
      if (second.outcome === 'approved') {
        expect(second.payment.reference).not.toBe(first.payment.reference);
        expect(rows.filter((row) => row.status === 'approved').map((row) => row.reference)).toEqual([
          second.payment.reference,
        ]);
      }
    });
  });

  it('P2-6 returns tendered or last4 for the approved subject and nothing for an unknown id', async () => {
    await inTransaction(db, async (_tx, repo) => {
      const cashId = id();
      const cardId = id();
      const charges = newChargePayment(repo);
      const receipts = new GetReceipt(repo);
      await charges.execute(cashCharge(cashId, 1000, 1500));
      await charges.execute(cardCharge(cardId, '4242'));

      const cash = await receipts.execute(cashId);
      const card = await receipts.execute(cardId);
      const missing = await receipts.execute(id());

      expect(cash?.details).toEqual({ method: 'cash', tendered: Money.of(1500, 'MXN') });
      expect(card?.details).toEqual({ method: 'card', cardLast4: '4242' });
      expect(missing).toBeNull();
    });
  });

  it('P2-7 rejects a negative amount, an unknown method, a short card and two approved rows', async () => {
    await inTransaction(db, async (tx) => {
      await expectConstraint(tx, () => tx.insert(payments).values(approvedRow({ amount: -1 })), {
        code: '23514',
        constraint: 'payments_amount_gte_0',
      });
      await expectConstraint(tx, () => tx.insert(payments).values(approvedRow({ method: 'bitcoin' })), {
        code: '23514',
        constraint: 'payments_method',
      });
      await expectConstraint(
        tx,
        () => tx.insert(payments).values(approvedRow({ cardLast4: '12' })),
        { code: '23514', constraint: 'payments_shape' },
      );

      const subjectId = id();
      await tx.insert(payments).values(approvedRow({ subjectId }));
      await expectConstraint(tx, () => tx.insert(payments).values(approvedRow({ subjectId })), {
        code: '23505',
        constraint: 'payments_one_approved_per_subject',
      });
    });
  });
});

function newChargePayment(repo: DrizzlePaymentRepository): ChargePayment {
  return new ChargePayment(
    repo,
    [
      new CashPaymentAdapter(() => crypto.randomUUID()),
      new CardPaymentAdapter(() => crypto.randomUUID()),
      new DigitalGatewayFakeAdapter(() => crypto.randomUUID()),
    ],
    () => crypto.randomUUID(),
    () => new Date('2026-10-28T18:00:00.000Z'),
  );
}

function cashCharge(subjectId: string, amount: number, tendered: number): Charge {
  return Charge.of({
    subjectId,
    amount: Money.of(amount, 'MXN'),
    details: PaymentDetails.cash(Money.of(tendered, 'MXN')),
  });
}

function cardCharge(subjectId: string, cardLast4: string): Charge {
  return Charge.of({
    subjectId,
    amount: Money.of(1000, 'MXN'),
    details: PaymentDetails.card(cardLast4),
  });
}

function gatewayCharge(subjectId: string, payerReference: string): Charge {
  return Charge.of({
    subjectId,
    amount: Money.of(1000, 'MXN'),
    details: PaymentDetails.digitalGateway(payerReference),
  });
}

function rowsFor(tx: PaymentDatabase, subjectId: string) {
  return tx.select().from(payments).where(eq(payments.subjectId, subjectId));
}

function approvedRow(overrides: Partial<typeof payments.$inferInsert>): typeof payments.$inferInsert {
  return {
    paymentId: id(),
    subjectId: id(),
    method: 'card',
    amount: 1000,
    currency: 'MXN',
    tenderedAmount: null,
    cardLast4: '4242',
    payerReference: null,
    reference: `card-${id()}`,
    paidAt: new Date('2026-10-28T18:00:00.000Z'),
    status: 'approved',
    ...overrides,
  };
}

async function inTransaction(
  db: PaymentsDatabase,
  run: (tx: PaymentDatabase, repo: DrizzlePaymentRepository) => Promise<void>,
): Promise<void> {
  let failure: unknown;

  try {
    await db.transaction(async (tx) => {
      try {
        await run(tx, new DrizzlePaymentRepository(tx));
      } catch (error) {
        failure = error;
      }
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      throw error;
    }
  }

  if (failure) {
    throw failure;
  }
}

async function expectConstraint(
  tx: PaymentDatabase,
  run: () => Promise<unknown>,
  expected: { code: string; constraint: string },
): Promise<void> {
  const savepoint = `sp_${id().replaceAll('-', '')}`;
  await tx.execute(sql.raw(`savepoint ${savepoint}`));

  try {
    await run();
    throw new Error(`expected postgres code ${expected.code}`);
  } catch (error) {
    if (error instanceof Error && error.message === `expected postgres code ${expected.code}`) {
      throw error;
    }
    expect(postgresCode(error)).toBe(expected.code);
    expect(postgresConstraint(error)).toBe(expected.constraint);
    await tx.execute(sql.raw(`rollback to savepoint ${savepoint}`));
  }
}

function postgresCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  if ('code' in error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) {
    return error.code;
  }
  if ('cause' in error) {
    return postgresCode(error.cause);
  }
  if (error instanceof postgres.PostgresError) {
    return error.code;
  }
  return undefined;
}

function postgresConstraint(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  if ('constraint_name' in error && typeof error.constraint_name === 'string') {
    return error.constraint_name;
  }
  if ('cause' in error) {
    return postgresConstraint(error.cause);
  }
  return undefined;
}

function id(): string {
  return crypto.randomUUID();
}

class RollbackSignal extends Error {
  constructor() {
    super('rollback');
    this.name = 'RollbackSignal';
  }
}

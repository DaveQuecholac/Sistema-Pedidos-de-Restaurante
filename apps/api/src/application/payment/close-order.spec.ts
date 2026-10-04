import { describe, expect, it } from 'vitest';
import { InvalidMoneyError, Money } from '../../domain/money/money';
import {
  InsufficientCashError,
  InvalidCardLast4Error,
  InvalidPayerReferenceError,
  InvalidPaymentMethodError,
  PaymentAmountMismatchError,
} from '../../domain/payment/payment.errors';
import { Order } from '../../domain/order/order';
import { OrderOrigin } from '../../domain/order/order-origin';
import { OrderNotClosableError } from '../../domain/order/order.errors';
import { Discount } from '../../domain/totals/discount';
import { Percentage } from '../../domain/totals/percentage';
import { Tip } from '../../domain/totals/tip';
import { InMemoryOrderRepository } from '../order/in-memory-order-repository';
import {
  OrderConcurrencyError,
  OrderNotFoundError,
} from '../order/order-repository.errors';
import {
  FIXED_NOW,
  closedOrderL,
  idsOf,
  readyOrderL,
  watchOrders,
  withConcurrentSave,
} from '../order/order-test-fixtures';
import type { OrderRepository } from '../ports/order-repository';
import { CloseOrder, type CloseOrderCommand } from './close-order';
import { FakePaymentPort } from './fake-payment-port';
import type { PaymentCommand } from './payment-command';
import {
  PaymentMethodUnavailableError,
  PaymentPortConfigurationError,
  PaymentProcessorUnavailableError,
} from './payment.errors';

function allPorts() {
  return [
    new FakePaymentPort('cash').approveWith('cash-ref'),
    new FakePaymentPort('card').approveWith('card-ref'),
    new FakePaymentPort('digitalGateway').approveWith('gw-ref'),
  ] as const;
}

function closeOrder(
  orders: OrderRepository,
  ports: readonly FakePaymentPort[] = [...allPorts()],
  newPaymentId: () => string = idsOf('pay-1'),
) {
  return {
    useCase: new CloseOrder(orders, ports, newPaymentId, () => FIXED_NOW),
    ports,
  };
}

async function seedReady(
  adjustments: { discount?: Discount | null; tip?: Tip | null } = {},
): Promise<InMemoryOrderRepository> {
  const orders = new InMemoryOrderRepository();
  await orders.add(readyOrderL(adjustments));
  return orders;
}

const cashClose: CloseOrderCommand = {
  orderId: 'order-1',
  expectedTotal: 16420,
  payment: { method: 'cash', tendered: 20000 },
};

describe('CloseOrder', () => {
  it('closes with cash and returns change (CO1)', async () => {
    const orders = await seedReady();
    const seen = watchOrders(orders);
    const { useCase, ports } = closeOrder(seen.orders);

    const result = await useCase.execute(cashClose);

    expect(result.order.status).toBe('CLOSED');
    expect(result.payment.change?.amount).toBe(3580);
    expect(ports[0]!.charges).toHaveLength(1);
    expect(ports[0]!.charges[0]!.amount.amount).toBe(16420);
    expect(seen.calls.save).toBe(1);
  });

  it('closes with card (CO2)', async () => {
    const orders = await seedReady();
    const { useCase } = closeOrder(orders);

    const result = await useCase.execute({
      orderId: 'order-1',
      expectedTotal: 16420,
      payment: { method: 'card', cardLast4: '4242' },
    });

    expect(result.order.status).toBe('CLOSED');
    expect(result.payment.change).toBeNull();
    if (result.payment.details.method === 'card') {
      expect(result.payment.details.cardLast4).toBe('4242');
    }
  });

  it('closes with digital gateway (CO3)', async () => {
    const orders = await seedReady();
    const { useCase } = closeOrder(orders);

    const result = await useCase.execute({
      orderId: 'order-1',
      expectedTotal: 16420,
      payment: { method: 'digitalGateway', payerReference: 'cliente@correo.mx' },
    });

    expect(result.order.status).toBe('CLOSED');
    if (result.payment.details.method === 'digitalGateway') {
      expect(result.payment.details.payerReference).toBe('cliente@correo.mx');
    }
  });

  it('rejects a missing order without charging (CO4)', async () => {
    const orders = new InMemoryOrderRepository();
    const seen = watchOrders(orders);
    const { useCase, ports } = closeOrder(seen.orders);

    await expect(useCase.execute(cashClose)).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(ports.flatMap((port) => port.charges)).toHaveLength(0);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects close outside READY without charging (CO5)', async () => {
    const statuses = ['OPEN', 'SENT_TO_KITCHEN', 'IN_KITCHEN', 'CANCELLED'] as const;
    for (const status of statuses) {
      const orders = new InMemoryOrderRepository();
      const base = readyOrderL();
      await orders.add(
        Order.restore({
          id: 'order-1',
          origin: base.origin,
          status,
          openedAt: base.openedAt,
          lines: base.lines,
          version: 0,
          discount: null,
          tip: null,
          payment: null,
        }),
      );
      const seen = watchOrders(orders);
      const { useCase, ports } = closeOrder(seen.orders);

      await expect(useCase.execute(cashClose)).rejects.toBeInstanceOf(OrderNotClosableError);
      expect(ports.flatMap((port) => port.charges)).toHaveLength(0);
      expect(seen.calls.save).toBe(0);
    }

    const closedRepo = new InMemoryOrderRepository();
    await closedRepo.add(closedOrderL());
    const seenClosed = watchOrders(closedRepo);
    const closed = closeOrder(seenClosed.orders);
    await expect(closed.useCase.execute(cashClose)).rejects.toBeInstanceOf(OrderNotClosableError);
    expect(closed.ports.flatMap((port) => port.charges)).toHaveLength(0);
    expect(seenClosed.calls.save).toBe(0);
  });

  it('checks status before payment details (CO6)', async () => {
    const orders = new InMemoryOrderRepository();
    const base = readyOrderL();
    await orders.add(
      Order.restore({
        id: 'order-1',
        origin: base.origin,
        status: 'CANCELLED',
        openedAt: base.openedAt,
        lines: base.lines,
        version: 0,
        discount: null,
        tip: null,
        payment: null,
      }),
    );
    const { useCase, ports } = closeOrder(orders);

    await expect(
      useCase.execute({
        orderId: 'order-1',
        expectedTotal: 16420,
        payment: { method: 'card', cardLast4: '12' },
      }),
    ).rejects.toBeInstanceOf(OrderNotClosableError);
    expect(ports.flatMap((port) => port.charges)).toHaveLength(0);
  });

  it('rejects invalid payment commands without charging (CO7)', async () => {
    const orders = await seedReady();
    const seen = watchOrders(orders);
    const { useCase, ports } = closeOrder(seen.orders);

    await expect(
      useCase.execute({
        orderId: 'order-1',
        expectedTotal: 16420,
        payment: { method: 'coupon' } as unknown as PaymentCommand,
      }),
    ).rejects.toBeInstanceOf(InvalidPaymentMethodError);

    await expect(
      useCase.execute({
        orderId: 'order-1',
        expectedTotal: 16420,
        payment: { method: 'card', cardLast4: '12' },
      }),
    ).rejects.toBeInstanceOf(InvalidCardLast4Error);

    await expect(
      useCase.execute({
        orderId: 'order-1',
        expectedTotal: 16420,
        payment: { method: 'digitalGateway', payerReference: '' },
      }),
    ).rejects.toBeInstanceOf(InvalidPayerReferenceError);

    await expect(
      useCase.execute({
        orderId: 'order-1',
        expectedTotal: 16420,
        payment: { method: 'cash', tendered: -1 },
      }),
    ).rejects.toBeInstanceOf(InvalidMoneyError);

    await expect(
      useCase.execute({
        orderId: 'order-1',
        expectedTotal: 16420,
        payment: { method: 'cash', tendered: 1.5 },
      }),
    ).rejects.toBeInstanceOf(InvalidMoneyError);

    expect(ports.flatMap((port) => port.charges)).toHaveLength(0);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects a stale expectedTotal without charging (CO8)', async () => {
    const orders = await seedReady({ tip: Tip.percentage(Percentage.of(1000)) });
    const seen = watchOrders(orders);
    const { useCase, ports } = closeOrder(seen.orders);

    expect((await orders.findById('order-1'))!.totals().total.amount).toBe(17870);
    await expect(useCase.execute(cashClose)).rejects.toBeInstanceOf(PaymentAmountMismatchError);
    expect(ports.flatMap((port) => port.charges)).toHaveLength(0);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects invalid expectedTotal values (CO9)', async () => {
    const orders = await seedReady();
    const { useCase, ports } = closeOrder(orders);

    for (const expectedTotal of [-1, 1.5, '16420'] as const) {
      await expect(
        useCase.execute({
          orderId: 'order-1',
          expectedTotal: expectedTotal as unknown as number,
          payment: { method: 'cash', tendered: 20000 },
        }),
      ).rejects.toBeInstanceOf(InvalidMoneyError);
    }
    expect(ports.flatMap((port) => port.charges)).toHaveLength(0);
  });

  it('rejects insufficient cash without charging (CO10)', async () => {
    const orders = await seedReady();
    const seen = watchOrders(orders);
    const { useCase, ports } = closeOrder(seen.orders);

    await expect(
      useCase.execute({
        orderId: 'order-1',
        expectedTotal: 16420,
        payment: { method: 'cash', tendered: 16000 },
      }),
    ).rejects.toBeInstanceOf(InsufficientCashError);
    expect(ports.flatMap((port) => port.charges)).toHaveLength(0);
    expect(seen.calls.save).toBe(0);
  });

  it('rejects a method without a configured port (CO11)', async () => {
    const orders = await seedReady();
    const cashOnly = [new FakePaymentPort('cash').approveWith('cash-ref')];
    const { useCase, ports } = closeOrder(orders, cashOnly);

    await expect(
      useCase.execute({
        orderId: 'order-1',
        expectedTotal: 16420,
        payment: { method: 'card', cardLast4: '4242' },
      }),
    ).rejects.toBeInstanceOf(PaymentMethodUnavailableError);
    expect(ports.flatMap((port) => port.charges)).toHaveLength(0);
  });

  it('rejects duplicate payment methods at construction (CO12)', () => {
    expect(
      () =>
        new CloseOrder(
          new InMemoryOrderRepository(),
          [new FakePaymentPort('cash'), new FakePaymentPort('cash')],
          idsOf('pay-1'),
          () => FIXED_NOW,
        ),
    ).toThrow(PaymentPortConfigurationError);
  });

  it('rejects a declined charge without saving (CO13)', async () => {
    const orders = await seedReady();
    const ports = [
      new FakePaymentPort('cash'),
      new FakePaymentPort('card').declineWith('cardDeclined'),
      new FakePaymentPort('digitalGateway'),
    ];
    const seen = watchOrders(orders);
    const useCase = new CloseOrder(seen.orders, ports, idsOf('pay-1'), () => FIXED_NOW);

    await expect(
      useCase.execute({
        orderId: 'order-1',
        expectedTotal: 16420,
        payment: { method: 'card', cardLast4: '4242' },
      }),
    ).rejects.toMatchObject({ name: 'PaymentDeclinedError', reason: 'cardDeclined' });
    expect(seen.calls.save).toBe(0);

    const reread = await orders.findById('order-1');
    expect(reread?.status).toBe('READY');
    expect(reread?.payment).toBeNull();
    expect(reread?.version).toBe(0);
    expect(ports[1]!.charges).toHaveLength(1);
  });

  it('propagates processor unavailability without voiding (CO14)', async () => {
    const orders = await seedReady();
    const ports = [
      new FakePaymentPort('cash'),
      new FakePaymentPort('card').failCharge(),
      new FakePaymentPort('digitalGateway'),
    ];
    const seen = watchOrders(orders);
    const useCase = new CloseOrder(seen.orders, ports, idsOf('pay-1'), () => FIXED_NOW);

    await expect(
      useCase.execute({
        orderId: 'order-1',
        expectedTotal: 16420,
        payment: { method: 'card', cardLast4: '4242' },
      }),
    ).rejects.toBeInstanceOf(PaymentProcessorUnavailableError);
    expect(seen.calls.save).toBe(0);
    expect(ports.flatMap((port) => port.voids)).toHaveLength(0);
  });

  it('voids after a concurrent save (CO15)', async () => {
    const orders = await seedReady();
    const tip = Tip.percentage(Percentage.of(1000));
    const concurrent = withConcurrentSave(orders, (order) => order.setTip(tip));
    const ports = [...allPorts()];
    const useCase = new CloseOrder(concurrent, ports, idsOf('pay-1'), () => FIXED_NOW);

    await expect(useCase.execute(cashClose)).rejects.toBeInstanceOf(OrderConcurrencyError);
    expect(ports[0]!.voids).toEqual(['cash-ref']);

    const stored = await orders.findById('order-1');
    expect(stored?.status).toBe('READY');
    expect(stored?.tip).toBe(tip);
    expect(stored?.payment).toBeNull();
    expect(stored?.version).toBe(1);
  });

  it('voids and rethrows when save fails (CO16)', async () => {
    const orders = await seedReady();
    const boom = new Error('boom');
    const failing: OrderRepository = {
      add: (order) => orders.add(order),
      findById: (id) => orders.findById(id),
      findByExternalOrderId: (id) => orders.findByExternalOrderId(id),
      list: (filter) => orders.list(filter),
      async save() {
        throw boom;
      },
    };
    const ports = [...allPorts()];
    const useCase = new CloseOrder(failing, ports, idsOf('pay-1'), () => FIXED_NOW);

    await expect(useCase.execute(cashClose)).rejects.toBe(boom);
    expect(ports[0]!.voids).toEqual(['cash-ref']);
  });

  it('reports PaymentVoidFailedError when void also fails (CO17)', async () => {
    const orders = await seedReady();
    const boom = new Error('boom');
    const failing: OrderRepository = {
      add: (order) => orders.add(order),
      findById: (id) => orders.findById(id),
      findByExternalOrderId: (id) => orders.findByExternalOrderId(id),
      list: (filter) => orders.list(filter),
      async save() {
        throw boom;
      },
    };
    const cash = new FakePaymentPort('cash').approveWith('cash-ref').failVoid();
    const ports = [cash, new FakePaymentPort('card'), new FakePaymentPort('digitalGateway')];
    const useCase = new CloseOrder(failing, ports, idsOf('pay-1'), () => FIXED_NOW);

    await expect(useCase.execute(cashClose)).rejects.toMatchObject({
      name: 'PaymentVoidFailedError',
      cause: boom,
    });
    expect(cash.voids).toEqual(['cash-ref']);
  });

  it('closes L+ with change 3917 (CO18)', async () => {
    const orders = await seedReady({
      discount: Discount.percentage(Percentage.of(1000)),
      tip: Tip.percentage(Percentage.of(1000)),
    });
    const { useCase } = closeOrder(orders);

    const result = await useCase.execute({
      orderId: 'order-1',
      expectedTotal: 16083,
      payment: { method: 'cash', tendered: 20000 },
    });

    expect(result.order.status).toBe('CLOSED');
    expect(result.payment.change?.amount).toBe(3917);
  });

  it('rejects a second close without a second charge (CO19)', async () => {
    const orders = await seedReady();
    const ports = [...allPorts()];
    const useCase = new CloseOrder(orders, ports, idsOf('pay-1', 'pay-2'), () => FIXED_NOW);

    await useCase.execute(cashClose);
    await expect(useCase.execute(cashClose)).rejects.toBeInstanceOf(OrderNotClosableError);
    expect(ports[0]!.charges).toHaveLength(1);
  });

  it('closes zero-total orders with cash or card (CO20)', async () => {
    const discount = Discount.fixedAmount(Money.of(20000, 'MXN'));
    const orders = new InMemoryOrderRepository();
    await orders.add(readyOrderL({ discount }));
    const base = readyOrderL({ discount });
    await orders.add(
      Order.restore({
        id: 'order-2',
        origin: OrderOrigin.table('6'),
        status: 'READY',
        openedAt: FIXED_NOW,
        lines: base.lines,
        version: 0,
        discount,
        tip: null,
        payment: null,
      }),
    );
    const { useCase } = closeOrder(orders, [...allPorts()], idsOf('pay-1', 'pay-2'));

    const cash = await useCase.execute({
      orderId: 'order-1',
      expectedTotal: 0,
      payment: { method: 'cash', tendered: 0 },
    });
    const card = await useCase.execute({
      orderId: 'order-2',
      expectedTotal: 0,
      payment: { method: 'card', cardLast4: '4242' },
    });

    expect(cash.payment.amount.amount).toBe(0);
    expect(card.payment.amount.amount).toBe(0);
    expect(cash.order.status).toBe('CLOSED');
    expect(card.order.status).toBe('CLOSED');
  });

  it('returns the reread order with fixed payment id and clock (CO21)', async () => {
    const orders = await seedReady();
    const { useCase, ports } = closeOrder(orders);

    const result = await useCase.execute(cashClose);

    expect(result.payment.id).toBe('pay-1');
    expect(result.payment.paidAt).toBe(FIXED_NOW);
    expect(result.payment.reference).toBe(ports[0]!.charges.length ? 'cash-ref' : '');
    expect(result.payment.reference).toBe('cash-ref');
    expect(result.order.version).toBe(1);
    expect(result.order.payment?.id).toBe('pay-1');
  });
});

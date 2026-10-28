import { describe, expect, it } from 'vitest';
import { InMemoryOrderRepository } from '../order/in-memory-order-repository';
import { OrderNotFoundError } from '../order/order-repository.errors';
import {
  FIXED_NOW,
  idsOf,
  readyOrderL,
  watchOrders,
} from '../order/order-test-fixtures';
import { CloseOrder } from './close-order';
import { FakePaymentPort } from './fake-payment-port';
import { GetOrderPayment } from './get-order-payment';
import { PaymentNotFoundError } from './payment.errors';

describe('GetOrderPayment', () => {
  it('returns the payment of an order closed by CO1 (GP1)', async () => {
    const orders = new InMemoryOrderRepository();
    await orders.add(readyOrderL());
    const ports = [
      new FakePaymentPort('cash').approveWith('cash-ref'),
      new FakePaymentPort('card'),
      new FakePaymentPort('digitalGateway'),
    ];
    const closed = await new CloseOrder(orders, ports, idsOf('pay-1'), () => FIXED_NOW).execute({
      orderId: 'order-1',
      expectedTotal: 16420,
      payment: { method: 'cash', tendered: 20000 },
    });

    const payment = await new GetOrderPayment(orders).execute('order-1');

    expect(payment.id).toBe(closed.payment.id);
    expect(payment.reference).toBe(closed.payment.reference);
    expect(payment.change?.amount).toBe(3580);
    expect(payment.amount.amount).toBe(16420);
  });

  it('rejects a READY order without payment (GP2)', async () => {
    const orders = new InMemoryOrderRepository();
    await orders.add(readyOrderL());

    await expect(new GetOrderPayment(orders).execute('order-1')).rejects.toBeInstanceOf(
      PaymentNotFoundError,
    );
  });

  it('rejects a missing order (GP3)', async () => {
    const orders = new InMemoryOrderRepository();

    await expect(new GetOrderPayment(orders).execute('missing')).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });

  it('never saves (GP4)', async () => {
    const orders = new InMemoryOrderRepository();
    await orders.add(readyOrderL());
    const seen = watchOrders(orders);
    const useCase = new GetOrderPayment(seen.orders);

    await expect(useCase.execute('order-1')).rejects.toBeInstanceOf(PaymentNotFoundError);
    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(seen.calls.save).toBe(0);
  });
});

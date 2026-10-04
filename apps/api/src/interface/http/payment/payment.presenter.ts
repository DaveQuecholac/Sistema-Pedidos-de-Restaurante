import type { Order } from '../../../domain/order/order';
import type { Payment } from '../../../domain/payment/payment';

export function presentClosedOrder(order: Order, payment: Payment) {
  return {
    orderId: order.id,
    status: order.status,
    payment: presentPayment(payment),
  };
}

export function presentPayment(payment: Payment) {
  const details = payment.details;

  return {
    id: payment.id,
    method: payment.method,
    amount: {
      amount: payment.amount.amount,
      currency: payment.amount.currency,
    },
    tendered:
      details.method === 'cash'
        ? { amount: details.tendered.amount, currency: details.tendered.currency }
        : null,
    change:
      payment.change === null
        ? null
        : { amount: payment.change.amount, currency: payment.change.currency },
    cardLast4: details.method === 'card' ? details.cardLast4 : null,
    payerReference: details.method === 'digitalGateway' ? details.payerReference : null,
    reference: payment.reference,
    paidAt: payment.paidAt.toISOString(),
  };
}

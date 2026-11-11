export type PaymentMethod = 'cash' | 'card' | 'digitalGateway';

const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'card', 'digitalGateway'];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);
}

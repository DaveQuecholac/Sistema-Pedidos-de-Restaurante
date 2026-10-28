import type { Payment } from '../../domain/payment/payment';

/** Reads the payment body that Pagos keeps for an order or a table sitting. */
export interface PaymentReceiptQuery {
  findBySubjectId(subjectId: string): Promise<Payment | null>;
}

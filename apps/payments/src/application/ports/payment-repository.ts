import type { Payment } from '../../domain/payment/payment';

export interface PaymentRepository {
  findApprovedBySubjectId(subjectId: string): Promise<Payment | null>;
  findByReference(reference: string): Promise<Payment | null>;
  insert(payment: Payment): Promise<void>;
  markVoided(paymentId: string): Promise<void>;
}

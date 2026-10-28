import type { Payment } from '../../domain/payment/payment';
import type { PaymentRepository } from '../ports/payment-repository';

export class GetReceipt {
  constructor(private readonly payments: PaymentRepository) {}

  execute(subjectId: string): Promise<Payment | null> {
    return this.payments.findApprovedBySubjectId(subjectId);
  }
}

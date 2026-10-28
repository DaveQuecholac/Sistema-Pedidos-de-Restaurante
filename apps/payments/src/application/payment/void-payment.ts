import type { PaymentRepository } from '../ports/payment-repository';
import { PaymentReferenceNotFoundError } from './payment.errors';

export class VoidPayment {
  constructor(private readonly payments: PaymentRepository) {}

  async execute(reference: string): Promise<void> {
    const payment = await this.payments.findByReference(reference);
    if (payment === null) {
      throw new PaymentReferenceNotFoundError();
    }
    if (payment.status === 'voided') {
      return;
    }
    await this.payments.markVoided(payment.id);
  }
}

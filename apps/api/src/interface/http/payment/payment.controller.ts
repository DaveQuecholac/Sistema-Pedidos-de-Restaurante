import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { CloseOrder } from '../../../application/payment/close-order';
import { GetOrderPayment } from '../../../application/payment/get-order-payment';
import { GetOrder } from '../../../application/order/get-order';
import { toPaymentHttpError } from './payment-http.errors';
import { presentClosedOrder } from './payment.presenter';
import { closeOrderBodySchema } from './payment.schema';

/** Driving adapter: HTTP close and payment lookup call the payment use cases. */
@Controller('orders')
export class PaymentController {
  constructor(
    private readonly closeOrder: CloseOrder,
    private readonly getOrderPayment: GetOrderPayment,
    private readonly getOrder: GetOrder,
  ) {}

  @Post(':orderId/close')
  @HttpCode(HttpStatus.OK)
  async close(@Param('orderId') orderId: string, @Body() body: unknown) {
    try {
      const command = closeOrderBodySchema.parse(body);
      const closed = await this.closeOrder.execute({
        orderId,
        expectedTotal: command.expectedTotal,
        payment: command.payment,
      });
      return presentClosedOrder(closed.order, closed.payment);
    } catch (error) {
      this.fail(error);
    }
  }

  @Get(':orderId/payment')
  async getPayment(@Param('orderId') orderId: string) {
    try {
      const payment = await this.getOrderPayment.execute(orderId);
      const order = await this.getOrder.execute(orderId);
      return presentClosedOrder(order, payment);
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): never {
    const translated = toPaymentHttpError(error);
    if (translated === null) {
      throw error;
    }

    throw new HttpException(translated.body, translated.status);
  }
}

import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Put,
} from '@nestjs/common';
import { GetOrder } from '../../../application/order/get-order';
import { CalculateTotals } from '../../../application/totals/calculate-totals';
import { SetOrderDiscount } from '../../../application/totals/set-order-discount';
import { SetOrderTip } from '../../../application/totals/set-order-tip';
import { toTotalsHttpError } from './totals-http.errors';
import { presentOrderTotals } from './totals.presenter';
import { setDiscountBodySchema, setTipBodySchema } from './totals.schema';

/** Driving adapter: HTTP totals endpoints call the calculation use cases. */
@Controller('orders')
export class TotalsController {
  constructor(
    private readonly calculateTotals: CalculateTotals,
    private readonly setOrderDiscount: SetOrderDiscount,
    private readonly setOrderTip: SetOrderTip,
    private readonly getOrder: GetOrder,
  ) {}

  @Get(':orderId/totals')
  async getTotals(@Param('orderId') orderId: string) {
    try {
      const totals = await this.calculateTotals.execute(orderId);
      const order = await this.getOrder.execute(orderId);
      return presentOrderTotals({
        orderId,
        adjustable: order.canAdjustTotals(),
        totals,
      });
    } catch (error) {
      this.fail(error);
    }
  }

  @Put(':orderId/discount')
  async setDiscount(@Param('orderId') orderId: string, @Body() body: unknown) {
    try {
      const command = setDiscountBodySchema.parse(body);
      const totals = await this.setOrderDiscount.execute({
        orderId,
        discount: command.discount,
      });
      const order = await this.getOrder.execute(orderId);
      return presentOrderTotals({
        orderId,
        adjustable: order.canAdjustTotals(),
        totals,
      });
    } catch (error) {
      this.fail(error);
    }
  }

  @Put(':orderId/tip')
  async setTip(@Param('orderId') orderId: string, @Body() body: unknown) {
    try {
      const command = setTipBodySchema.parse(body);
      const totals = await this.setOrderTip.execute({
        orderId,
        tip: command.tip,
      });
      const order = await this.getOrder.execute(orderId);
      return presentOrderTotals({
        orderId,
        adjustable: order.canAdjustTotals(),
        totals,
      });
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): never {
    const translated = toTotalsHttpError(error);
    if (translated === null) {
      throw error;
    }

    throw new HttpException(translated.body, translated.status);
  }
}

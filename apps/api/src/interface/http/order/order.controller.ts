import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AddLine } from '../../../application/order/add-line';
import { BeginCooking } from '../../../application/order/begin-cooking';
import { CancelLine } from '../../../application/order/cancel-line';
import { CancelOrder } from '../../../application/order/cancel-order';
import { GetOrder } from '../../../application/order/get-order';
import { ListOrders } from '../../../application/order/list-orders';
import { MarkOrderReady } from '../../../application/order/mark-order-ready';
import { ModifyLine } from '../../../application/order/modify-line';
import { OpenOrder } from '../../../application/order/open-order';
import { SendToKitchen } from '../../../application/order/send-to-kitchen';
import { toOrderHttpError } from './order-http.errors';
import { presentOrder } from './order.presenter';
import {
  addLineBodySchema,
  emptyOrderBodySchema,
  listOrdersQuerySchema,
  modifyLineBodySchema,
  openOrderBodySchema,
} from './order.schema';

/** Driving adapter: HTTP calls the order use cases and returns product names. */
@Controller('orders')
export class OrderController {
  constructor(
    private readonly openOrder: OpenOrder,
    private readonly listOrders: ListOrders,
    private readonly getOrder: GetOrder,
    private readonly addLine: AddLine,
    private readonly modifyLine: ModifyLine,
    private readonly cancelLine: CancelLine,
    private readonly sendToKitchen: SendToKitchen,
    private readonly beginCooking: BeginCooking,
    private readonly markOrderReady: MarkOrderReady,
    private readonly cancelOrder: CancelOrder,
  ) {}

  @Post()
  async open(@Body() body: unknown) {
    try {
      const command = openOrderBodySchema.parse(body);
      const order = await this.openOrder.execute(command);
      return presentOrder(order);
    } catch (error) {
      this.fail(error);
    }
  }

  @Get()
  async list(@Query() query: unknown) {
    try {
      const filter = listOrdersQuerySchema.parse(query);
      const orders = await this.listOrders.execute(filter);
      return orders.map(presentOrder);
    } catch (error) {
      this.fail(error);
    }
  }

  @Get(':orderId')
  async get(@Param('orderId') orderId: string) {
    try {
      const order = await this.getOrder.execute(orderId);
      return presentOrder(order);
    } catch (error) {
      this.fail(error);
    }
  }

  @Post(':orderId/lines')
  async addOrderLine(@Param('orderId') orderId: string, @Body() body: unknown) {
    try {
      const command = addLineBodySchema.parse(body);
      const order = await this.addLine.execute({ ...command, orderId });
      return presentOrder(order);
    } catch (error) {
      this.fail(error);
    }
  }

  @Patch(':orderId/lines/:lineId')
  async modifyOrderLine(
    @Param('orderId') orderId: string,
    @Param('lineId') lineId: string,
    @Body() body: unknown,
  ) {
    try {
      const command = modifyLineBodySchema.parse(body);
      const order = await this.modifyLine.execute({ ...command, orderId, lineId });
      return presentOrder(order);
    } catch (error) {
      this.fail(error);
    }
  }

  @Delete(':orderId/lines/:lineId')
  async cancelOrderLine(
    @Param('orderId') orderId: string,
    @Param('lineId') lineId: string,
  ) {
    try {
      const order = await this.cancelLine.execute({ orderId, lineId });
      return presentOrder(order);
    } catch (error) {
      this.fail(error);
    }
  }

  @Post(':orderId/send-to-kitchen')
  @HttpCode(HttpStatus.OK)
  async sendOrderToKitchen(@Param('orderId') orderId: string, @Body() body: unknown) {
    try {
      emptyOrderBodySchema.parse(body ?? {});
      const order = await this.sendToKitchen.execute(orderId);
      return presentOrder(order);
    } catch (error) {
      this.fail(error);
    }
  }

  @Post(':orderId/begin-cooking')
  @HttpCode(HttpStatus.OK)
  async beginOrderCooking(@Param('orderId') orderId: string, @Body() body: unknown) {
    try {
      emptyOrderBodySchema.parse(body ?? {});
      const order = await this.beginCooking.execute(orderId);
      return presentOrder(order);
    } catch (error) {
      this.fail(error);
    }
  }

  @Post(':orderId/mark-ready')
  @HttpCode(HttpStatus.OK)
  async markReady(@Param('orderId') orderId: string, @Body() body: unknown) {
    try {
      emptyOrderBodySchema.parse(body ?? {});
      const order = await this.markOrderReady.execute(orderId);
      return presentOrder(order);
    } catch (error) {
      this.fail(error);
    }
  }

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('orderId') orderId: string, @Body() body: unknown) {
    try {
      emptyOrderBodySchema.parse(body ?? {});
      const order = await this.cancelOrder.execute(orderId);
      return presentOrder(order);
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): never {
    const translated = toOrderHttpError(error);
    if (translated === null) {
      throw error;
    }

    throw new HttpException(translated.body, translated.status);
  }
}

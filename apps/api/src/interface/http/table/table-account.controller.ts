import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { z } from 'zod';
import { CloseTableAccount } from '../../../application/table/close-table-account';
import { GetTableAccount } from '../../../application/table/get-table-account';
import { SetTableBillingMode, SetTableDiscount, SetTableTip } from '../../../application/table/set-table-account';
import {
  NoOpenTableSittingError,
  TableAccountEmptyError,
  TableAccountNotReadyError,
  TableSittingClosedError,
} from '../../../domain/table/table-sitting';
import { presentPayment } from '../payment/payment.presenter';
import { closeOrderBodySchema } from '../payment/payment.schema';
import { toPaymentHttpError } from '../payment/payment-http.errors';
import { setDiscountBodySchema, setTipBodySchema } from '../totals/totals.schema';
import { presentTableAccount } from './table-account.presenter';

const billingModeBodySchema = z
  .object({ billingMode: z.enum(['combined', 'separate']) })
  .strict();

@Controller('tables/:tableId/account')
export class TableAccountController {
  constructor(
    private readonly getTableAccount: GetTableAccount,
    private readonly setBillingMode: SetTableBillingMode,
    private readonly setDiscount: SetTableDiscount,
    private readonly setTip: SetTableTip,
    private readonly closeTableAccount: CloseTableAccount,
  ) {}

  @Get()
  async get(@Param('tableId') tableId: string) {
    const account = await this.getTableAccount.execute(tableId);
    return presentTableAccount(tableId, account);
  }

  @Put('billing-mode')
  async billingMode(@Param('tableId') tableId: string, @Body() body: unknown) {
    try {
      const command = billingModeBodySchema.parse(body);
      const account = await this.setBillingMode.execute(tableId, command.billingMode);
      return presentTableAccount(tableId, account);
    } catch (error) {
      this.fail(error);
    }
  }

  @Put('discount')
  async discount(@Param('tableId') tableId: string, @Body() body: unknown) {
    try {
      const command = setDiscountBodySchema.parse(body);
      const account = await this.setDiscount.execute(tableId, command.discount);
      return presentTableAccount(tableId, account);
    } catch (error) {
      this.fail(error);
    }
  }

  @Put('tip')
  async tip(@Param('tableId') tableId: string, @Body() body: unknown) {
    try {
      const command = setTipBodySchema.parse(body);
      const account = await this.setTip.execute(tableId, command.tip);
      return presentTableAccount(tableId, account);
    } catch (error) {
      this.fail(error);
    }
  }

  @Post('close')
  @HttpCode(HttpStatus.OK)
  async close(@Param('tableId') tableId: string, @Body() body: unknown) {
    try {
      const command = closeOrderBodySchema.parse(body);
      const closed = await this.closeTableAccount.execute({
        tableId,
        expectedTotal: command.expectedTotal,
        payment: command.payment,
      });
      return {
        tableId,
        orderIds: closed.orderIds,
        payment: presentPayment(closed.payment),
      };
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): never {
    if (
      error instanceof NoOpenTableSittingError ||
      error instanceof TableAccountEmptyError ||
      error instanceof TableAccountNotReadyError ||
      error instanceof TableSittingClosedError
    ) {
      const status = error instanceof NoOpenTableSittingError ? 404 : 409;
      throw new HttpException({ code: error.name, message: error.message }, status);
    }

    const translated = toPaymentHttpError(error);
    if (translated === null) {
      throw error;
    }
    throw new HttpException(translated.body, translated.status);
  }
}

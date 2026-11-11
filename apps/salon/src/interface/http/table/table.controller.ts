import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ActivateTable } from '../../../application/table/activate-table';
import { CreateTable } from '../../../application/table/create-table';
import { DeactivateTable } from '../../../application/table/deactivate-table';
import { GetTable } from '../../../application/table/get-table';
import { ListTables } from '../../../application/table/list-tables';
import { UpdateTable } from '../../../application/table/update-table';
import { toTableHttpError } from './table-http.errors';
import { presentTable } from './table.presenter';
import {
  createTableBodySchema,
  emptyTableBodySchema,
  updateTableBodySchema,
} from './table.schema';

/** Driving adapter: HTTP calls table catalog use cases and returns product names. */
@Controller('tables')
export class TableController {
  constructor(
    private readonly createTable: CreateTable,
    private readonly listTables: ListTables,
    private readonly getTable: GetTable,
    private readonly updateTable: UpdateTable,
    private readonly deactivateTable: DeactivateTable,
    private readonly activateTable: ActivateTable,
  ) {}

  @Post()
  async create(@Body() body: unknown) {
    try {
      const command = createTableBodySchema.parse(body);
      const table = await this.createTable.execute(command);
      return presentTable(table);
    } catch (error) {
      this.fail(error);
    }
  }

  @Get()
  async list() {
    try {
      const tables = await this.listTables.execute();
      return tables.map(presentTable);
    } catch (error) {
      this.fail(error);
    }
  }

  @Get(':tableId')
  async get(@Param('tableId') tableId: string) {
    try {
      const table = await this.getTable.execute(tableId);
      return presentTable(table);
    } catch (error) {
      this.fail(error);
    }
  }

  @Patch(':tableId')
  async update(@Param('tableId') tableId: string, @Body() body: unknown) {
    try {
      const command = updateTableBodySchema.parse(body);
      const table = await this.updateTable.execute({ ...command, id: tableId });
      return presentTable(table);
    } catch (error) {
      this.fail(error);
    }
  }

  @Post(':tableId/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('tableId') tableId: string, @Body() body: unknown) {
    try {
      emptyTableBodySchema.parse(body ?? {});
      const table = await this.deactivateTable.execute(tableId);
      return presentTable(table);
    } catch (error) {
      this.fail(error);
    }
  }

  @Post(':tableId/activate')
  @HttpCode(HttpStatus.OK)
  async activate(@Param('tableId') tableId: string, @Body() body: unknown) {
    try {
      emptyTableBodySchema.parse(body ?? {});
      const table = await this.activateTable.execute(tableId);
      return presentTable(table);
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): never {
    const translated = toTableHttpError(error);
    if (translated === null) {
      throw error;
    }

    throw new HttpException(translated.body, translated.status);
  }
}

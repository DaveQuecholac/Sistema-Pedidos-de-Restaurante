import { DynamicModule, Module } from '@nestjs/common';
import { ActivateTable } from './application/table/activate-table';
import { CreateTable } from './application/table/create-table';
import { DeactivateTable } from './application/table/deactivate-table';
import { GetTable } from './application/table/get-table';
import { ListTables } from './application/table/list-tables';
import { UpdateTable } from './application/table/update-table';
import type { TableRepository } from './application/ports/table-repository';
import type { TableDatabase } from './infrastructure/persistence/drizzle/drizzle-table-repository';
import {
  createActiveOrdersGrpcCaller,
  GrpcActiveOrdersQuery,
} from './infrastructure/orders/grpc-active-orders-query';
import { DrizzleTableRepository } from './infrastructure/persistence/drizzle/drizzle-table-repository';
import { TableController } from './interface/http/table/table.controller';

export const TABLE_REPOSITORY = Symbol('TABLE_REPOSITORY');

/** Composition root: salon database, floor-plan use cases, and the REST controller. */
@Module({})
export class SalonModule {
  static register(db: TableDatabase, ordersGrpcUrl: string): DynamicModule {
    return {
      module: SalonModule,
      controllers: [TableController],
      providers: [
        {
          provide: TABLE_REPOSITORY,
          useFactory: () => new DrizzleTableRepository(db),
        },
        {
          provide: ListTables,
          inject: [TABLE_REPOSITORY],
          useFactory: (tables: TableRepository) => new ListTables(tables),
        },
        {
          provide: GetTable,
          inject: [TABLE_REPOSITORY],
          useFactory: (tables: TableRepository) => new GetTable(tables),
        },
        {
          provide: CreateTable,
          inject: [TABLE_REPOSITORY],
          useFactory: (tables: TableRepository) => new CreateTable(tables),
        },
        {
          provide: UpdateTable,
          inject: [TABLE_REPOSITORY],
          useFactory: (tables: TableRepository) => new UpdateTable(tables),
        },
        {
          provide: ActivateTable,
          inject: [TABLE_REPOSITORY],
          useFactory: (tables: TableRepository) => new ActivateTable(tables),
        },
        {
          provide: DeactivateTable,
          inject: [TABLE_REPOSITORY],
          useFactory: (tables: TableRepository) =>
            new DeactivateTable(tables, new GrpcActiveOrdersQuery(createActiveOrdersGrpcCaller(ordersGrpcUrl))),
        },
      ],
    };
  }
}

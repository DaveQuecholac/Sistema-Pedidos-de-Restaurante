import { DynamicModule, Module } from '@nestjs/common';
import { CheckDatabaseConnection } from './application/database/check-database-connection';
import { AddLine } from './application/order/add-line';
import { CancelLine } from './application/order/cancel-line';
import { CancelOrder } from './application/order/cancel-order';
import { GetOrder } from './application/order/get-order';
import { ListOrders } from './application/order/list-orders';
import { BeginCooking } from './application/order/begin-cooking';
import { MarkOrderReady } from './application/order/mark-order-ready';
import { ModifyLine } from './application/order/modify-line';
import { OpenOrder } from './application/order/open-order';
import { SendToKitchen } from './application/order/send-to-kitchen';
import { DatabaseHealthPort } from './application/ports/database-health.port';
import type { MenuCatalog } from './application/ports/menu-catalog';
import { OrderRepository } from './application/ports/order-repository';
import type { TableCatalog } from './application/ports/table-catalog';
import type { TableRepository } from './application/ports/table-repository';
import type { TableSittingRepository } from './application/ports/table-sitting-repository';
import { CloseTableAccount } from './application/table/close-table-account';
import { GetTableAccount } from './application/table/get-table-account';
import { SetTableBillingMode, SetTableDiscount, SetTableTip } from './application/table/set-table-account';
import { CloseOrder } from './application/payment/close-order';
import { GetOrderPayment } from './application/payment/get-order-payment';
import type { PaymentPort } from './application/ports/payment-port';
import { ActivateTable } from './application/table/activate-table';
import { CreateTable } from './application/table/create-table';
import { DeactivateTable } from './application/table/deactivate-table';
import { GetTable } from './application/table/get-table';
import { ListTables } from './application/table/list-tables';
import { UpdateTable } from './application/table/update-table';
import { CalculateTotals } from './application/totals/calculate-totals';
import { SetOrderDiscount } from './application/totals/set-order-discount';
import { SetOrderTip } from './application/totals/set-order-tip';
import { GrpcMenuCatalog, createMenuGrpcCaller } from './infrastructure/menu/grpc-menu-catalog';
import { GrpcTableCatalog, createTableGrpcCaller } from './infrastructure/table/grpc-table-catalog';
import {
  GrpcPaymentAdapter,
  createPaymentGrpcCaller,
} from './infrastructure/payment/grpc-payment-adapter';
import { AppDatabase } from './infrastructure/persistence/drizzle/client';
import { DrizzleDatabaseHealth } from './infrastructure/persistence/drizzle/drizzle-database-health';
import { DrizzleOrderRepository } from './infrastructure/persistence/drizzle/drizzle-order-repository';
import { DrizzleTableRepository } from './infrastructure/persistence/drizzle/drizzle-table-repository';
import { DrizzleTableSittingRepository } from './infrastructure/persistence/drizzle/drizzle-table-sitting-repository';
import { DatabaseHealthController } from './interface/http/controllers/database-health.controller';
import { HealthController } from './interface/http/controllers/health.controller';
import { OrderController } from './interface/http/order/order.controller';
import { PaymentController } from './interface/http/payment/payment.controller';
import { TableAccountController } from './interface/http/table/table-account.controller';
import { TableController } from './interface/http/table/table.controller';
import { TotalsController } from './interface/http/totals/totals.controller';

export const DATABASE_HEALTH_PORT = Symbol('DATABASE_HEALTH_PORT');
export const MENU_CATALOG = Symbol('MENU_CATALOG');
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');
export const TABLE_REPOSITORY = Symbol('TABLE_REPOSITORY');
export const TABLE_CATALOG = Symbol('TABLE_CATALOG');
export const TABLE_SITTING_REPOSITORY = Symbol('TABLE_SITTING_REPOSITORY');
export const PAYMENT_PORTS = Symbol('PAYMENT_PORTS');

/** Composition root: health, orders, catalog, and payments through driven adapters. */
@Module({})
export class AppModule {
  static register(
    db: AppDatabase,
    paymentsGrpcUrl: string,
    menuGrpcUrl: string,
    salonGrpcUrl: string,
  ): DynamicModule {
    const payments = createPaymentGrpcCaller(paymentsGrpcUrl);
    const catalog = new GrpcMenuCatalog(createMenuGrpcCaller(menuGrpcUrl));
    const tablesCatalog = new GrpcTableCatalog(createTableGrpcCaller(salonGrpcUrl));
    const cash = new GrpcPaymentAdapter(payments, 'cash');
    const card = new GrpcPaymentAdapter(payments, 'card');
    const gateway = new GrpcPaymentAdapter(payments, 'digitalGateway');

    return {
      module: AppModule,
      controllers: [
        HealthController,
        DatabaseHealthController,
        TableController,
        TableAccountController,
        OrderController,
        TotalsController,
        PaymentController,
      ],
      providers: [
        {
          provide: DATABASE_HEALTH_PORT,
          useValue: new DrizzleDatabaseHealth(db),
        },
        {
          provide: CheckDatabaseConnection,
          inject: [DATABASE_HEALTH_PORT],
          useFactory: (database: DatabaseHealthPort) => new CheckDatabaseConnection(database),
        },
        {
          provide: MENU_CATALOG,
          useValue: catalog,
        },
        {
          provide: ORDER_REPOSITORY,
          useValue: new DrizzleOrderRepository(db, cash),
        },
        {
          provide: TABLE_REPOSITORY,
          useValue: new DrizzleTableRepository(db),
        },
        {
          provide: TABLE_CATALOG,
          useValue: tablesCatalog,
        },
        {
          provide: TABLE_SITTING_REPOSITORY,
          useValue: new DrizzleTableSittingRepository(db, cash),
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
          provide: DeactivateTable,
          inject: [TABLE_REPOSITORY, ORDER_REPOSITORY],
          useFactory: (tables: TableRepository, orders: OrderRepository) =>
            new DeactivateTable(tables, orders),
        },
        {
          provide: ActivateTable,
          inject: [TABLE_REPOSITORY],
          useFactory: (tables: TableRepository) => new ActivateTable(tables),
        },
        {
          provide: OpenOrder,
          inject: [ORDER_REPOSITORY, TABLE_CATALOG, TABLE_SITTING_REPOSITORY],
          useFactory: (
            orders: OrderRepository,
            tables: TableCatalog,
            sittings: TableSittingRepository,
          ) => new OpenOrder(orders, tables, sittings, () => crypto.randomUUID(), () => new Date()),
        },
        {
          provide: ListOrders,
          inject: [ORDER_REPOSITORY],
          useFactory: (orders: OrderRepository) => new ListOrders(orders),
        },
        {
          provide: GetOrder,
          inject: [ORDER_REPOSITORY],
          useFactory: (orders: OrderRepository) => new GetOrder(orders),
        },
        {
          provide: AddLine,
          inject: [ORDER_REPOSITORY, MENU_CATALOG],
          useFactory: (orders: OrderRepository, menu: MenuCatalog) =>
            new AddLine(orders, menu, () => crypto.randomUUID()),
        },
        {
          provide: ModifyLine,
          inject: [ORDER_REPOSITORY, MENU_CATALOG],
          useFactory: (orders: OrderRepository, menu: MenuCatalog) =>
            new ModifyLine(orders, menu),
        },
        {
          provide: CancelLine,
          inject: [ORDER_REPOSITORY],
          useFactory: (orders: OrderRepository) => new CancelLine(orders),
        },
        {
          provide: SendToKitchen,
          inject: [ORDER_REPOSITORY],
          useFactory: (orders: OrderRepository) => new SendToKitchen(orders),
        },
        {
          provide: BeginCooking,
          inject: [ORDER_REPOSITORY],
          useFactory: (orders: OrderRepository) => new BeginCooking(orders),
        },
        {
          provide: MarkOrderReady,
          inject: [ORDER_REPOSITORY],
          useFactory: (orders: OrderRepository) => new MarkOrderReady(orders),
        },
        {
          provide: CancelOrder,
          inject: [ORDER_REPOSITORY],
          useFactory: (orders: OrderRepository) => new CancelOrder(orders),
        },
        {
          provide: CalculateTotals,
          inject: [ORDER_REPOSITORY],
          useFactory: (orders: OrderRepository) => new CalculateTotals(orders),
        },
        {
          provide: SetOrderDiscount,
          inject: [ORDER_REPOSITORY],
          useFactory: (orders: OrderRepository) => new SetOrderDiscount(orders),
        },
        {
          provide: SetOrderTip,
          inject: [ORDER_REPOSITORY],
          useFactory: (orders: OrderRepository) => new SetOrderTip(orders),
        },
        {
          provide: PAYMENT_PORTS,
          useValue: [cash, card, gateway] satisfies PaymentPort[],
        },
        {
          provide: CloseOrder,
          inject: [ORDER_REPOSITORY, PAYMENT_PORTS],
          useFactory: (orders: OrderRepository, payments: PaymentPort[]) =>
            new CloseOrder(orders, payments, () => crypto.randomUUID(), () => new Date()),
        },
        {
          provide: GetOrderPayment,
          inject: [ORDER_REPOSITORY],
          useFactory: (orders: OrderRepository) => new GetOrderPayment(orders),
        },
        {
          provide: GetTableAccount,
          inject: [ORDER_REPOSITORY, TABLE_SITTING_REPOSITORY],
          useFactory: (orders: OrderRepository, sittings: TableSittingRepository) =>
            new GetTableAccount(orders, sittings),
        },
        {
          provide: SetTableBillingMode,
          inject: [ORDER_REPOSITORY, TABLE_SITTING_REPOSITORY],
          useFactory: (orders: OrderRepository, sittings: TableSittingRepository) =>
            new SetTableBillingMode(orders, sittings),
        },
        {
          provide: SetTableDiscount,
          inject: [ORDER_REPOSITORY, TABLE_SITTING_REPOSITORY],
          useFactory: (orders: OrderRepository, sittings: TableSittingRepository) =>
            new SetTableDiscount(orders, sittings),
        },
        {
          provide: SetTableTip,
          inject: [ORDER_REPOSITORY, TABLE_SITTING_REPOSITORY],
          useFactory: (orders: OrderRepository, sittings: TableSittingRepository) =>
            new SetTableTip(orders, sittings),
        },
        {
          provide: CloseTableAccount,
          inject: [ORDER_REPOSITORY, TABLE_SITTING_REPOSITORY, PAYMENT_PORTS],
          useFactory: (
            orders: OrderRepository,
            sittings: TableSittingRepository,
            payments: PaymentPort[],
          ) => new CloseTableAccount(orders, sittings, payments, () => crypto.randomUUID(), () => new Date()),
        },
      ],
    };
  }
}

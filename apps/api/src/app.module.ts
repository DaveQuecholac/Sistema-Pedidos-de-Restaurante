import { DynamicModule, Module } from '@nestjs/common';
import { CheckDatabaseConnection } from './application/database/check-database-connection';
import { CreateMenuItem } from './application/menu/create-menu-item';
import { DeactivateMenuItem } from './application/menu/deactivate-menu-item';
import { ListMenuItems } from './application/menu/list-menu-items';
import { UpdateMenuItem } from './application/menu/update-menu-item';
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
import { MenuRepository } from './application/ports/menu-repository';
import { OrderRepository } from './application/ports/order-repository';
import { CloseOrder } from './application/payment/close-order';
import { GetOrderPayment } from './application/payment/get-order-payment';
import type { PaymentPort } from './application/ports/payment-port';
import { CalculateTotals } from './application/totals/calculate-totals';
import { SetOrderDiscount } from './application/totals/set-order-discount';
import { SetOrderTip } from './application/totals/set-order-tip';
import {
  CardPaymentAdapter,
  CashPaymentAdapter,
  DigitalGatewayFakeAdapter,
} from './infrastructure/payment';
import { AppDatabase } from './infrastructure/persistence/drizzle/client';
import { DrizzleDatabaseHealth } from './infrastructure/persistence/drizzle/drizzle-database-health';
import { DrizzleMenuRepository } from './infrastructure/persistence/drizzle/drizzle-menu-repository';
import { DrizzleOrderRepository } from './infrastructure/persistence/drizzle/drizzle-order-repository';
import { DatabaseHealthController } from './interface/http/controllers/database-health.controller';
import { HealthController } from './interface/http/controllers/health.controller';
import { MenuItemController } from './interface/http/menu/menu-item.controller';
import { OrderController } from './interface/http/order/order.controller';
import { PaymentController } from './interface/http/payment/payment.controller';
import { TotalsController } from './interface/http/totals/totals.controller';

export const DATABASE_HEALTH_PORT = Symbol('DATABASE_HEALTH_PORT');
export const MENU_REPOSITORY = Symbol('MENU_REPOSITORY');
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');
export const PAYMENT_PORTS = Symbol('PAYMENT_PORTS');

/** Composition root: health, menu, orders, and payments through driven adapters. */
@Module({})
export class AppModule {
  static register(db: AppDatabase): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        DatabaseHealthController,
        MenuItemController,
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
          provide: MENU_REPOSITORY,
          useValue: new DrizzleMenuRepository(db),
        },
        {
          provide: ORDER_REPOSITORY,
          useValue: new DrizzleOrderRepository(db),
        },
        {
          provide: ListMenuItems,
          inject: [MENU_REPOSITORY],
          useFactory: (menu: MenuRepository) => new ListMenuItems(menu),
        },
        {
          provide: DeactivateMenuItem,
          inject: [MENU_REPOSITORY],
          useFactory: (menu: MenuRepository) => new DeactivateMenuItem(menu),
        },
        {
          provide: CreateMenuItem,
          inject: [MENU_REPOSITORY],
          useFactory: (menu: MenuRepository) => new CreateMenuItem(menu, () => crypto.randomUUID()),
        },
        {
          provide: UpdateMenuItem,
          inject: [MENU_REPOSITORY],
          useFactory: (menu: MenuRepository) => new UpdateMenuItem(menu, () => crypto.randomUUID()),
        },
        {
          provide: OpenOrder,
          inject: [ORDER_REPOSITORY],
          useFactory: (orders: OrderRepository) =>
            new OpenOrder(orders, () => crypto.randomUUID(), () => new Date()),
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
          inject: [ORDER_REPOSITORY, MENU_REPOSITORY],
          useFactory: (orders: OrderRepository, menu: MenuRepository) =>
            new AddLine(orders, menu, () => crypto.randomUUID()),
        },
        {
          provide: ModifyLine,
          inject: [ORDER_REPOSITORY, MENU_REPOSITORY],
          useFactory: (orders: OrderRepository, menu: MenuRepository) =>
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
          useValue: [
            new CashPaymentAdapter(() => crypto.randomUUID()),
            new CardPaymentAdapter(() => crypto.randomUUID()),
            new DigitalGatewayFakeAdapter(() => crypto.randomUUID()),
          ] satisfies PaymentPort[],
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
      ],
    };
  }
}

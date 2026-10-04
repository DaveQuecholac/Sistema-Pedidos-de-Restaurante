import { LineItem } from '../../domain/order/line-item';
import { Order } from '../../domain/order/order';
import { OrderNotEditableError } from '../../domain/order/order.errors';
import { orderStatus } from '../../domain/order/order-status';
import { Quantity } from '../../domain/order/quantity';
import { MenuItemNotFoundError } from '../menu/menu-item-repository.errors';
import type { MenuRepository } from '../ports/menu-repository';
import type { OrderRepository } from '../ports/order-repository';
import { OrderNotFoundError } from './order-repository.errors';

export type AddLineCommand = {
  orderId: string;
  menuItemId: string;
  quantity: number;
  modifierIds: string[];
};

export class AddLine {
  constructor(
    private readonly orders: OrderRepository,
    private readonly menu: MenuRepository,
    private readonly generateId: () => string,
  ) {}

  async execute(command: AddLineCommand): Promise<Order> {
    const order = await this.orders.findById(command.orderId);
    if (order === null) {
      throw new OrderNotFoundError();
    }
    if (!orderStatus(order.status).canEditLines) {
      throw new OrderNotEditableError();
    }

    const menuItem = await this.menu.findById(command.menuItemId);
    if (menuItem === null) {
      throw new MenuItemNotFoundError();
    }

    const line = LineItem.capture({
      id: this.generateId(),
      menuItem,
      quantity: Quantity.of(command.quantity),
      modifierIds: command.modifierIds,
    });

    const updated = order.addLine(line);
    await this.orders.save(updated);
    const saved = await this.orders.findById(updated.id);
    if (saved === null) {
      throw new OrderNotFoundError();
    }
    return saved;
  }
}

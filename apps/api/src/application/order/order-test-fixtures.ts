import { Ingredient } from '../../domain/menu/ingredient';
import { MenuItem } from '../../domain/menu/menu-item';
import { Modifier } from '../../domain/menu/modifier';
import { TaxRate } from '../../domain/menu/tax-rate';
import { Money } from '../../domain/money/money';
import type { Order } from '../../domain/order/order';
import type { OrderRepository } from '../ports/order-repository';
import { InMemoryMenuRepository } from '../menu/in-memory-menu-repository';

export const TACOS_ID = 'item-tacos';
export const FLAN_ID = 'item-flan';
export const AGUA_ID = 'item-agua-jamaica';
export const QUESO_ID = 'mod-queso';
export const CILANTRO_ID = 'mod-cilantro';
export const OTHER_EXTRA_ID = 'mod-chia';
export const CHIA_ID = 'mod-chia-agua';
export const AZUCAR_ID = 'mod-azucar';
export const FIXED_NOW = new Date('2026-10-04T18:00:00.000Z');

/** Active tacos: 4500 MXN, tax 1600, Queso extra, Cilantro exclusion. */
export function tacosDish(): MenuItem {
  return MenuItem.create({
    id: TACOS_ID,
    name: 'Tacos',
    price: Money.of(4500, 'MXN'),
    applicableTax: TaxRate.of(1600),
    ingredients: [
      Ingredient.of({ id: 'ing-tortilla', name: 'Tortilla' }),
      Ingredient.of({ id: 'ing-suadero', name: 'Suadero' }),
      Ingredient.of({ id: 'ing-cilantro', name: 'Cilantro' }),
    ],
    modifiers: [
      Modifier.extra({ id: QUESO_ID, name: 'Queso', price: Money.of(1500, 'MXN') }),
      Modifier.exclusion({ id: CILANTRO_ID, name: 'Cilantro' }),
    ],
  });
}

/** Inactive flan: 3500 MXN, no modifiers. */
export function flanDish(): MenuItem {
  return MenuItem.restore({
    id: FLAN_ID,
    name: 'Flan',
    price: Money.of(3500, 'MXN'),
    applicableTax: TaxRate.of(1600),
    active: false,
    ingredients: [],
    modifiers: [],
  });
}

export function otherDishWithExtra(): MenuItem {
  return MenuItem.create({
    id: 'item-agua',
    name: 'Agua',
    price: Money.of(2500, 'MXN'),
    applicableTax: TaxRate.of(1600),
    ingredients: [],
    modifiers: [Modifier.extra({ id: OTHER_EXTRA_ID, name: 'Chia', price: Money.of(500, 'MXN') })],
  });
}

/** Agua de jamaica: 2500 MXN, tax 0, Chía extra, Azúcar exclusion. Order L fixture. */
export function aguaDish(): MenuItem {
  return MenuItem.create({
    id: AGUA_ID,
    name: 'Agua de jamaica',
    price: Money.of(2500, 'MXN'),
    applicableTax: TaxRate.of(0),
    ingredients: [Ingredient.of({ id: 'ing-azucar', name: 'Azúcar' })],
    modifiers: [
      Modifier.extra({ id: CHIA_ID, name: 'Chía', price: Money.of(500, 'MXN') }),
      Modifier.exclusion({ id: AZUCAR_ID, name: 'Azúcar' }),
    ],
  });
}

export async function seedMenu(
  ...items: MenuItem[]
): Promise<InMemoryMenuRepository> {
  const menu = new InMemoryMenuRepository();
  for (const item of items) {
    await menu.add(item);
  }
  return menu;
}

export function idsOf(...values: string[]): () => string {
  const pending = [...values];
  return () => {
    const next = pending.shift();
    if (next === undefined) {
      throw new Error('test id generator ran out');
    }
    return next;
  };
}

export function watchOrders(orders: OrderRepository) {
  const calls = { add: 0, save: 0 };
  const wrapped: OrderRepository = {
    async add(order) {
      calls.add += 1;
      await orders.add(order);
    },
    async save(order) {
      calls.save += 1;
      await orders.save(order);
    },
    findById: (id) => orders.findById(id),
    findByExternalOrderId: (id) => orders.findByExternalOrderId(id),
    list: (filter) => orders.list(filter),
  };
  return { orders: wrapped, calls };
}

/** After findById returns, apply a concurrent save on the real repo, then return the stale read. */
export function withConcurrentSave(
  orders: OrderRepository,
  mutate: (order: Order) => Order,
): OrderRepository {
  let pending = true;
  return {
    add: (order) => orders.add(order),
    save: (order) => orders.save(order),
    findByExternalOrderId: (id) => orders.findByExternalOrderId(id),
    list: (filter) => orders.list(filter),
    async findById(id) {
      const order = await orders.findById(id);
      if (order !== null && pending) {
        pending = false;
        await orders.save(mutate(order));
      }
      return order;
    },
  };
}

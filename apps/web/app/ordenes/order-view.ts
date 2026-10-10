import type { MenuItemJson } from '../menu/menu-api';
import { centavosToLabel } from '../menu/menu-amount';
import type {
  LineItemJson,
  LineModifierJson,
  OrderActionJson,
  OrderJson,
  OrderStatusJson,
} from './order-api';
import { OrderApiError } from './order-api';

export type BoardStatus =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; orders: readonly OrderJson[] };

const STATUS_LABELS: Record<OrderStatusJson, string> = {
  OPEN: 'Abierta',
  SENT_TO_KITCHEN: 'En cocina',
  IN_KITCHEN: 'En cocción',
  READY: 'Lista',
  CLOSED: 'Cerrada',
  CANCELLED: 'Cancelada',
};

const ERROR_TEXTS: Record<string, string> = {
  ExternalOrderIdInUseError: 'Ese pedido externo ya se registró.',
  OrderNotEditableError: 'La orden ya está en cocina. No se puede cambiar.',
  OrderConcurrencyError: 'Otra persona cambió esta orden. Se recargó con lo último.',
  EmptyOrderError: 'Agrega al menos un plato antes de enviar a cocina.',
  InvalidQuantityError: 'La cantidad tiene que ser de 1 a 99.',
  MenuItemUnavailableError: 'Ese plato ya no está a la venta.',
};

export function statusLabel(status: OrderStatusJson): string {
  return STATUS_LABELS[status];
}

export function originLabel(order: OrderJson): string {
  if (order.tableId !== null) {
    return `Mesa ${order.tableId}`;
  }
  if (order.externalOrderId !== null) {
    return `Pedido externo ${order.externalOrderId}`;
  }
  return 'Sin origen';
}

export function openedAtLabel(order: OrderJson, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(order.openedAt));

  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

export function can(order: OrderJson, action: OrderActionJson): boolean {
  return order.allowedActions.includes(action);
}

export function lockNotice(order: OrderJson): string | null {
  if (can(order, 'editLines')) {
    return null;
  }

  if (order.status === 'SENT_TO_KITCHEN') {
    return 'Esta orden ya se envió a cocina. Ya no se pueden agregar, cambiar ni quitar platos.';
  }
  if (order.status === 'IN_KITCHEN') {
    return 'Pedido actualmente en cocción. Ya no se puede cancelar ni cambiar platos.';
  }
  if (order.status === 'READY') {
    return 'Esta orden ya está lista. Ya no se pueden agregar, cambiar ni quitar platos.';
  }
  if (order.status === 'CLOSED') {
    return 'Esta orden está cerrada. Ya no se pueden agregar, cambiar ni quitar platos.';
  }
  if (order.status === 'CANCELLED') {
    return 'Esta orden está cancelada. Ya no se pueden agregar, cambiar ni quitar platos.';
  }

  return 'Ya no se pueden agregar, cambiar ni quitar platos.';
}

export function modifierLabel(modifier: LineModifierJson): string {
  if (modifier.kind === 'exclusion') {
    return `sin ${modifier.name}`;
  }

  const price = modifier.price === null ? '' : ` ${centavosToLabel(modifier.price.amount)}`;
  return `+ ${modifier.name}${price}`;
}

export function orderableItems(menu: readonly MenuItemJson[]): MenuItemJson[] {
  return menu.filter((item) => item.active);
}

export function preselect(
  line: LineItemJson,
  menuItem: MenuItemJson,
): { modifierIds: string[]; missing: boolean } {
  const modifierIds: string[] = [];
  let missing = false;

  for (const chosen of line.modifiers) {
    const match = menuItem.modifiers.find(
      (candidate) => candidate.kind === chosen.kind && candidate.name === chosen.name,
    );
    if (match === undefined) {
      missing = true;
    } else {
      modifierIds.push(match.id);
    }
  }

  return { modifierIds, missing };
}

export function errorText(error: unknown): string {
  if (error instanceof OrderApiError) {
    if (error.code !== null) {
      const known = ERROR_TEXTS[error.code];
      if (known !== undefined) {
        return known;
      }
      return `${error.code}: ${error.message}`;
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'No se pudo completar la petición.';
}

export function boardView(status: BoardStatus): 'loading' | 'error' | 'empty' | 'list' {
  if (status.kind === 'loading') {
    return 'loading';
  }
  if (status.kind === 'error') {
    return 'error';
  }
  return status.orders.length === 0 ? 'empty' : 'list';
}

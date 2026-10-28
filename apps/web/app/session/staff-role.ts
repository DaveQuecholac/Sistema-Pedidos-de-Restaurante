export const STAFF_ROLES = ['waiter', 'cashier', 'kitchen'] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

const STORAGE_KEY = 'restaurante.staffRole';

export const STAFF_AREAS: readonly {
  role: StaffRole;
  label: string;
  detail: string;
}[] = [
  { role: 'waiter', label: 'Mesero', detail: 'Mesas y comandas' },
  { role: 'cashier', label: 'Cobro', detail: 'Órdenes listas para cobrar' },
  { role: 'kitchen', label: 'Cocina', detail: 'Cocción y pedidos listos' },
];

export function isStaffRole(value: string | null): value is StaffRole {
  return value === 'waiter' || value === 'cashier' || value === 'kitchen';
}

export function roleHome(role: StaffRole): string {
  if (role === 'waiter') {
    return '/';
  }
  if (role === 'cashier') {
    return '/pago';
  }
  return '/cocina';
}

/** Screens each area is allowed to open. Menu admin and table admin stay out of the three areas. */
export function roleAllowsPath(role: StaffRole, path: string): boolean {
  if (role === 'waiter') {
    return path === '/' || path.startsWith('/ordenes');
  }
  if (role === 'cashier') {
    return path === '/pago' || path.startsWith('/pago/');
  }
  return path === '/cocina' || path.startsWith('/cocina/');
}

export function readStoredRole(storage: Pick<Storage, 'getItem'>): StaffRole | null {
  const value = storage.getItem(STORAGE_KEY);
  return isStaffRole(value) ? value : null;
}

export function writeStoredRole(storage: Pick<Storage, 'setItem'>, role: StaffRole): void {
  storage.setItem(STORAGE_KEY, role);
}

export function clearStoredRole(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(STORAGE_KEY);
}

export function staffRoleLabel(role: StaffRole): string {
  const area = STAFF_AREAS.find((item) => item.role === role);
  return area === undefined ? role : area.label;
}

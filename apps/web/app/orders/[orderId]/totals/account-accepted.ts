const prefix = 'restaurante.accountAccepted.';

export function isAccountAccepted(orderId: string): boolean {
  if (typeof sessionStorage === 'undefined') {
    return false;
  }
  return sessionStorage.getItem(`${prefix}${orderId}`) === '1';
}

export function acceptAccount(orderId: string): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  sessionStorage.setItem(`${prefix}${orderId}`, '1');
}

export function clearAccountAccepted(orderId: string): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  sessionStorage.removeItem(`${prefix}${orderId}`);
}

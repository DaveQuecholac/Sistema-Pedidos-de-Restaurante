import { MenuItem } from '../../../domain/menu/menu-item';

export function presentMenuItem(item: MenuItem) {
  return {
    id: item.id,
    name: item.name,
    price: {
      amount: item.price.amount,
      currency: item.price.currency,
    },
    applicableTax: {
      basisPoints: item.applicableTax.basisPoints,
    },
    active: item.active,
    modifiers: item.modifiers.map((modifier) => ({
      id: modifier.id,
      name: modifier.name,
      kind: modifier.kind,
      price:
        modifier.price === null
          ? null
          : {
              amount: modifier.price.amount,
              currency: modifier.price.currency,
            },
    })),
  };
}

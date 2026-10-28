import { status } from '@grpc/grpc-js';
import { describe, expect, it } from 'vitest';
import { MenuCatalogUnavailableError } from '../../application/order/menu-catalog.error';
import { GrpcMenuCatalog, type MenuGrpcCaller, type MenuItemCall } from './grpc-menu-catalog';

class FakeCaller implements MenuGrpcCaller {
  reply: MenuItemCall | Error = tacosReply();

  getMenuItem(): Promise<MenuItemCall> {
    if (this.reply instanceof Error) {
      return Promise.reject(this.reply);
    }
    return Promise.resolve(this.reply);
  }
}

function grpcError(code: status): Error {
  const error = new Error('grpc') as Error & { code: number };
  error.code = code;
  return error;
}

function tacosReply(): MenuItemCall {
  return {
    id: 'item-tacos',
    name: 'Tacos',
    price: { amount: 4500, currency: 'MXN' },
    taxBasisPoints: 1600,
    active: true,
    ingredients: [{ id: 'ing-tortilla', name: 'Tortilla' }],
    modifiers: [
      { id: 'mod-queso', name: 'Queso', kind: 'extra', price: { amount: 1500, currency: 'MXN' } },
      { id: 'mod-cilantro', name: 'Cilantro', kind: 'exclusion' },
    ],
  };
}

describe('GrpcMenuCatalog', () => {
  it('maps a snapshot onto the catalog port (M3-6)', async () => {
    const catalog = new GrpcMenuCatalog(new FakeCaller());

    const item = await catalog.findById('item-tacos');

    expect(item?.id).toBe('item-tacos');
    expect(item?.name).toBe('Tacos');
    expect(item?.price.amount).toBe(4500);
    expect(item?.price.currency).toBe('MXN');
    expect(item?.applicableTax.basisPoints).toBe(1600);
    expect(item?.active).toBe(true);
    expect(item?.ingredients).toEqual([{ id: 'ing-tortilla', name: 'Tortilla' }]);
    expect(item?.modifiers[0]?.id).toBe('mod-queso');
    expect(item?.modifiers[0]?.kind).toBe('extra');
    expect(item?.modifiers[0]?.price?.amount).toBe(1500);
    expect(item?.modifiers[1]?.id).toBe('mod-cilantro');
    expect(item?.modifiers[1]?.kind).toBe('exclusion');
    expect(item?.modifiers[1]?.price).toBeNull();
  });

  it('turns NOT_FOUND into null (M3-6)', async () => {
    const caller = new FakeCaller();
    caller.reply = grpcError(status.NOT_FOUND);
    const catalog = new GrpcMenuCatalog(caller);

    await expect(catalog.findById('missing')).resolves.toBeNull();
  });

  it('turns a silent channel into MenuCatalogUnavailableError (M3-6)', async () => {
    const caller = new FakeCaller();
    caller.reply = grpcError(status.UNAVAILABLE);
    const catalog = new GrpcMenuCatalog(caller);

    await expect(catalog.findById('item-tacos')).rejects.toBeInstanceOf(MenuCatalogUnavailableError);
    await expect(catalog.findById('item-tacos')).rejects.toThrow('Menu catalog did not respond');
  });
});

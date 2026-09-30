import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import { CreateMenuItem } from '../../../application/menu/create-menu-item';
import { DeactivateMenuItem } from '../../../application/menu/deactivate-menu-item';
import { InMemoryMenuRepository } from '../../../application/menu/in-memory-menu-repository';
import { ListMenuItems } from '../../../application/menu/list-menu-items';
import { UpdateMenuItem } from '../../../application/menu/update-menu-item';
import { MenuRepository } from '../../../application/ports/menu-repository';
import { MenuItemController } from './menu-item.controller';
import { createMenuItemBodySchema, deactivateMenuItemBodySchema, updateMenuItemBodySchema } from './menu-item.schema';

type Calls = { add: number; save: number };

function sequentialGenerateId(): () => string {
  let issued = 0;
  return () => {
    issued += 1;
    if (issued === 1) {
      return 'item-1';
    }
    return `mod-${issued - 1}`;
  };
}

function watch(menu: InMemoryMenuRepository): { port: MenuRepository; calls: Calls } {
  const calls = { add: 0, save: 0 };
  const port: MenuRepository = {
    async add(item) {
      calls.add += 1;
      await menu.add(item);
    },
    async save(item) {
      calls.save += 1;
      await menu.save(item);
    },
    findById: (id) => menu.findById(id),
    list: () => menu.list(),
  };
  return { port, calls };
}

function testModule(menu: MenuRepository, generateId: () => string) {
  @Module({
    controllers: [MenuItemController],
    providers: [
      { provide: CreateMenuItem, useValue: new CreateMenuItem(menu, generateId) },
      { provide: ListMenuItems, useValue: new ListMenuItems(menu) },
      { provide: UpdateMenuItem, useValue: new UpdateMenuItem(menu, generateId) },
      { provide: DeactivateMenuItem, useValue: new DeactivateMenuItem(menu) },
    ],
  })
  class MenuHttpModule {}

  return MenuHttpModule;
}

function dish(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Tacos al pastor',
    price: { amount: 4500, currency: 'MXN' },
    applicableTax: { basisPoints: 1600 },
    ingredients: [{ name: 'Sin cilantro' }],
    modifiers: [
      { name: 'Queso extra', kind: 'extra', price: { amount: 1500, currency: 'MXN' } },
      { name: 'Sin cilantro', kind: 'exclusion' },
    ],
    ...overrides,
  };
}

function invalidRequest(schema: ZodType, body: unknown) {
  const parsed = schema.safeParse(body);
  if (parsed.success) {
    throw new Error('expected the body to fail validation');
  }

  const issue = parsed.error.issues[0];
  if (issue === undefined) {
    throw new Error('expected a Zod issue');
  }

  return { code: 'InvalidRequest', message: issue.message };
}

describe('menu items HTTP', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function listen(): Promise<{ base: string; menu: InMemoryMenuRepository; calls: Calls }> {
    const menu = new InMemoryMenuRepository();
    const seen = watch(menu);
    app = await NestFactory.create(testModule(seen.port, sequentialGenerateId()), { logger: false });
    await app.listen(0);
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('HTTP server did not bind a port');
    }
    return { base: `http://127.0.0.1:${address.port}`, menu, calls: seen.calls };
  }

  async function send(url: string, method: string, body?: unknown): Promise<Response> {
    return fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it('creates a dish with an extra and an exclusion (H1)', async () => {
    const { base, menu } = await listen();
    const response = await send(`${base}/menu-items`, 'POST', dish());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      id: 'item-1',
      name: 'Tacos al pastor',
      price: { amount: 4500, currency: 'MXN' },
      applicableTax: { basisPoints: 1600 },
      active: true,
      ingredients: [{ id: 'mod-3', name: 'Sin cilantro' }],
      modifiers: [
        {
          id: 'mod-1',
          name: 'Queso extra',
          kind: 'extra',
          price: { amount: 1500, currency: 'MXN' },
        },
        {
          id: 'mod-2',
          name: 'Sin cilantro',
          kind: 'exclusion',
          price: null,
        },
      ],
    });

    const stored = await menu.findById('item-1');
    expect(stored?.modifiers.map((modifier) => modifier.id)).toEqual(['mod-1', 'mod-2']);
    expect(stored?.modifiers.map((modifier) => modifier.kind)).toEqual(['extra', 'exclusion']);
  });

  it('lists nothing when the catalog is empty (H2)', async () => {
    const { base } = await listen();
    const response = await send(`${base}/menu-items`, 'GET');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('lists an active dish and an inactive dish (H3)', async () => {
    const { base } = await listen();
    await send(`${base}/menu-items`, 'POST', dish());
    const second = await send(`${base}/menu-items`, 'POST', dish({ name: 'Agua', modifiers: [] }));
    const created = await second.json();

    const deactivated = await send(`${base}/menu-items/${created.id}/deactivate`, 'POST');
    expect(deactivated.status).toBe(200);

    const response = await send(`${base}/menu-items`, 'GET');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body.find((item: { id: string }) => item.id === 'item-1').active).toBe(true);
    expect(body.find((item: { id: string }) => item.id === created.id).active).toBe(false);
  });

  it('replaces the dish and gives the new modifier another id (H4)', async () => {
    const { base } = await listen();
    await send(`${base}/menu-items`, 'POST', dish());

    const response = await send(`${base}/menu-items/item-1`, 'PATCH', {
      name: 'Tacos de suadero',
      price: { amount: 4500, currency: 'MXN' },
      applicableTax: { basisPoints: 1600 },
      active: true,
      ingredients: [],
      modifiers: [{ name: 'Salsa', kind: 'extra', price: { amount: 500, currency: 'MXN' } }],
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe('item-1');
    expect(body.name).toBe('Tacos de suadero');
    expect(body.modifiers).toHaveLength(1);
    expect(body.modifiers[0].id).not.toBe('mod-1');
    expect(body.modifiers[0].id).not.toBe('mod-2');
  });

  it('deactivates the dish and keeps its modifiers (H5)', async () => {
    const { base } = await listen();
    const created = await (await send(`${base}/menu-items`, 'POST', dish())).json();
    const response = await send(`${base}/menu-items/${created.id}/deactivate`, 'POST');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.active).toBe(false);
    expect(body.modifiers).toEqual(created.modifiers);
  });

  it('stays inactive when deactivated again (H6)', async () => {
    const { base } = await listen();
    const created = await (await send(`${base}/menu-items`, 'POST', dish())).json();
    await send(`${base}/menu-items/${created.id}/deactivate`, 'POST');
    const response = await send(`${base}/menu-items/${created.id}/deactivate`, 'POST');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.active).toBe(false);
    expect(body.modifiers).toEqual(created.modifiers);
  });

  it('answers not found for a missing dish (H7)', async () => {
    const { base } = await listen();
    const patch = await send(`${base}/menu-items/missing`, 'PATCH', {
      name: 'Tacos',
      price: { amount: 4500, currency: 'MXN' },
      applicableTax: { basisPoints: 1600 },
      active: true,
      ingredients: [],
      modifiers: [],
    });
    const deactivate = await send(`${base}/menu-items/missing/deactivate`, 'POST');

    expect(patch.status).toBe(404);
    expect(await patch.json()).toEqual({
      code: 'MenuItemNotFoundError',
      message: 'Menu item was not found',
    });
    expect(deactivate.status).toBe(404);
    expect(await deactivate.json()).toEqual({
      code: 'MenuItemNotFoundError',
      message: 'Menu item was not found',
    });
  });

  it('rejects a blank name and stores nothing (H8)', async () => {
    const { base, menu, calls } = await listen();
    const response = await send(`${base}/menu-items`, 'POST', dish({ name: '   ' }));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      code: 'BlankNameError',
      message: 'Name must not be blank',
    });
    expect(calls.add).toBe(0);
    expect(await menu.list()).toHaveLength(0);
  });

  it('rejects a fractional amount (H9)', async () => {
    const { base, menu, calls } = await listen();
    const response = await send(`${base}/menu-items`, 'POST', dish({ price: { amount: 1.5, currency: 'MXN' } }));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      code: 'InvalidMoneyError',
      message: 'Money must be an integer amount from 0 to 2147483647 in MXN',
    });
    expect(calls.add).toBe(0);
    expect(await menu.list()).toHaveLength(0);
  });

  it('rejects a currency other than MXN (H10)', async () => {
    const { base, menu, calls } = await listen();
    const response = await send(`${base}/menu-items`, 'POST', dish({ price: { amount: 4500, currency: 'USD' } }));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      code: 'InvalidMoneyError',
      message: 'Money must be an integer amount from 0 to 2147483647 in MXN',
    });
    expect(calls.add).toBe(0);
    expect(await menu.list()).toHaveLength(0);
  });

  it('rejects a negative tax rate (H11)', async () => {
    const { base, menu, calls } = await listen();
    const response = await send(
      `${base}/menu-items`,
      'POST',
      dish({ applicableTax: { basisPoints: -1 } }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      code: 'InvalidTaxRateError',
      message: 'Tax rate must be an integer from 0 to 2147483647 basis points',
    });
    expect(calls.add).toBe(0);
    expect(await menu.list()).toHaveLength(0);
  });

  it('rejects an extra without a price (H12)', async () => {
    const { base, menu, calls } = await listen();
    const response = await send(
      `${base}/menu-items`,
      'POST',
      dish({ modifiers: [{ name: 'Queso extra', kind: 'extra' }] }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      code: 'ExtraMissingPriceError',
      message: 'An extra modifier requires a price',
    });
    expect(calls.add).toBe(0);
    expect(await menu.list()).toHaveLength(0);
  });

  it('rejects an exclusion that includes a price (H13)', async () => {
    const { base, menu, calls } = await listen();
    const response = await send(
      `${base}/menu-items`,
      'POST',
      dish({
        modifiers: [
          { name: 'Sin cilantro', kind: 'exclusion', price: { amount: 100, currency: 'MXN' } },
        ],
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      code: 'ExclusionHasPriceError',
      message: 'An exclusion modifier must not have a price',
    });
    expect(calls.add).toBe(0);
    expect(await menu.list()).toHaveLength(0);
  });

  it('rejects an unknown modifier kind (H14)', async () => {
    const { base, menu, calls } = await listen();
    const response = await send(
      `${base}/menu-items`,
      'POST',
      dish({ modifiers: [{ name: 'Nota', kind: 'note' }] }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      code: 'InvalidModifierKindError',
      message: 'Modifier kind must be extra or exclusion',
    });
    expect(calls.add).toBe(0);
    expect(await menu.list()).toHaveLength(0);
  });

  it('rejects a body whose shape is not a menu item and does not store it (H15)', async () => {
    const { base, menu, calls } = await listen();
    const stringAmount = dish({ price: { amount: '4500', currency: 'MXN' } });
    const withoutTax = {
      name: 'Tacos al pastor',
      price: { amount: 4500, currency: 'MXN' },
      modifiers: [],
    };
    const amount = await send(`${base}/menu-items`, 'POST', stringAmount);
    const missingTax = await send(`${base}/menu-items`, 'POST', withoutTax);
    const amountBody = await amount.json();
    const missingTaxBody = await missingTax.json();

    expect(amount.status).toBe(400);
    expect(amountBody).toEqual(invalidRequest(createMenuItemBodySchema, stringAmount));
    expect(amountBody.message).not.toContain('4500');
    expect(missingTax.status).toBe(400);
    expect(missingTaxBody).toEqual(invalidRequest(createMenuItemBodySchema, withoutTax));
    expect(calls.add).toBe(0);
    expect(await menu.list()).toHaveLength(0);
  });

  it('rejects a body that tries to set the id and leaves the dish unchanged (H16)', async () => {
    const { base, menu, calls } = await listen();
    await send(`${base}/menu-items`, 'POST', dish());
    const changed = {
      id: 'otro',
      name: 'Cambiado',
      price: { amount: 4500, currency: 'MXN' },
      applicableTax: { basisPoints: 1600 },
      active: true,
      ingredients: [],
      modifiers: [],
    };
    const response = await send(`${base}/menu-items/item-1`, 'PATCH', changed);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual(invalidRequest(updateMenuItemBodySchema, changed));
    expect(body.message).not.toContain('otro');
    expect(calls.save).toBe(0);
    expect((await menu.findById('item-1'))?.name).toBe('Tacos al pastor');
  });

  it('rejects a deactivate body that carries fields', async () => {
    const { base, menu } = await listen();
    await send(`${base}/menu-items`, 'POST', dish());
    const response = await send(`${base}/menu-items/item-1/deactivate`, 'POST', { id: 'otro' });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual(invalidRequest(deactivateMenuItemBodySchema, { id: 'otro' }));
    expect(body.message).not.toContain('otro');
    expect((await menu.findById('item-1'))?.active).toBe(true);
  });
});

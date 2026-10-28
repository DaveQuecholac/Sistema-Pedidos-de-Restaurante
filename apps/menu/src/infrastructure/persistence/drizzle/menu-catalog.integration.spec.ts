import { createRequire } from 'node:module';
import { credentials, loadPackageDefinition, status, type ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import type { Sql, TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CreateMenuItem } from '../../../application/menu/create-menu-item';
import { DeactivateMenuItem } from '../../../application/menu/deactivate-menu-item';
import { ListMenuItems } from '../../../application/menu/list-menu-items';
import { UpdateMenuItem } from '../../../application/menu/update-menu-item';
import { createDatabase } from './client';
import { DrizzleMenuRepository } from './drizzle-menu-repository';
import { startMenuGrpcServer } from '../../../interface/grpc/menu-grpc-server';

const nodeRequire = createRequire(__filename);

const integrationOn = process.env.MENU_REPOSITORY_INTEGRATION === '1';

if (integrationOn && !process.env.MENU_DATABASE_URL) {
  throw new Error('MENU_DATABASE_URL is required');
}

const describeIntegration = integrationOn ? describe : describe.skip;

type SnapshotReply = {
  id: string;
  name: string;
  price: { amount: number; currency: string };
  taxBasisPoints: number;
  active: boolean;
  ingredients: { id: string; name: string }[];
  modifiers: { id: string; name: string; kind: string; price?: { amount: number; currency: string } }[];
};

type CatalogClient = {
  getMenuItem: (
    request: { id: string },
    callback: (error: ServiceError | null, response?: SnapshotReply) => void,
  ) => void;
  close: () => void;
};

describeIntegration('menu catalog on the menu database', () => {
  let client: Sql;
  let repo: DrizzleMenuRepository;
  let dishId = '';

  beforeAll(() => {
    const url = process.env.MENU_DATABASE_URL;
    if (!url) {
      throw new Error('MENU_DATABASE_URL is required');
    }
    const opened = createDatabase(url);
    client = opened.client;
    repo = new DrizzleMenuRepository(opened.db);
  });

  afterAll(async () => {
    if (dishId) {
      await client`delete from menu_items where id = ${dishId}`;
    }
    await client.end();
  });

  it('creates, lists, changes the price and deactivates without deleting the row (M3-1)', async () => {
    const created = await new CreateMenuItem(repo, () => crypto.randomUUID()).execute({
      name: 'Tacos',
      price: { amount: 4500, currency: 'MXN' },
      applicableTax: { basisPoints: 1600 },
      ingredients: [{ name: 'Cilantro' }],
      modifiers: [{ name: 'Queso', kind: 'extra', price: { amount: 1500, currency: 'MXN' } }],
    });
    dishId = created.id;

    const listed = await new ListMenuItems(repo).execute();
    expect(listed.map((item) => item.id)).toContain(created.id);

    const updated = await new UpdateMenuItem(repo, () => crypto.randomUUID()).execute({
      id: created.id,
      name: 'Tacos',
      price: { amount: 5200, currency: 'MXN' },
      applicableTax: { basisPoints: 1600 },
      active: true,
      ingredients: [{ name: 'Cilantro' }],
      modifiers: [{ name: 'Queso', kind: 'extra', price: { amount: 1500, currency: 'MXN' } }],
    });
    expect(updated.id).toBe(created.id);
    expect(updated.price.amount).toBe(5200);

    const inactive = await new DeactivateMenuItem(repo).execute(created.id);
    expect(inactive.id).toBe(created.id);
    expect(inactive.active).toBe(false);

    const stored = await repo.findById(created.id);
    expect(stored).not.toBeNull();
    expect(stored?.active).toBe(false);
    expect(stored?.price.amount).toBe(5200);
  });

  it('returns the M3-1 dish from GetMenuItem and NOT_FOUND for an unknown id (M3-2)', async () => {
    const { server, port } = await startMenuGrpcServer(repo, '127.0.0.1:0');
    const catalog = openCatalog(port);
    try {
      const snapshot = await getMenuItem(catalog, dishId);
      expect(snapshot.name).toBe('Tacos');
      expect(snapshot.price).toEqual({ amount: 5200, currency: 'MXN' });
      expect(snapshot.taxBasisPoints).toBe(1600);
      expect(snapshot.ingredients.map((ingredient) => ingredient.name)).toEqual(['Cilantro']);
      const extra = snapshot.modifiers.find((modifier) => modifier.kind === 'extra');
      expect(extra?.price).toEqual({ amount: 1500, currency: 'MXN' });

      await expect(getMenuItem(catalog, `missing-${crypto.randomUUID()}`)).rejects.toMatchObject({
        code: status.NOT_FOUND,
      });
    } finally {
      catalog.close();
      server.forceShutdown();
    }
  });

  it('rejects a blank name, a negative price, a negative tax, a bad kind, an extra without price and an exclusion with price (M3-3)', async () => {
    const blankId = crypto.randomUUID();
    await expectConstraint(
      'menu_items_name_not_blank',
      () => client`
        insert into menu_items (id, name, price_amount, price_currency, tax_basis_points, active)
        values (${blankId}, ${'   '}, 1000, 'MXN', 0, true)
      `,
    );
    await expectGone(client, blankId);

    const negativePriceId = crypto.randomUUID();
    await expectConstraint(
      'menu_items_price_amount_gte_0',
      () => client`
        insert into menu_items (id, name, price_amount, price_currency, tax_basis_points, active)
        values (${negativePriceId}, 'Tacos', -1, 'MXN', 0, true)
      `,
    );
    await expectGone(client, negativePriceId);

    const negativeTaxId = crypto.randomUUID();
    await expectConstraint(
      'menu_items_tax_basis_points_gte_0',
      () => client`
        insert into menu_items (id, name, price_amount, price_currency, tax_basis_points, active)
        values (${negativeTaxId}, 'Tacos', 1000, 'MXN', -1, true)
      `,
    );
    await expectGone(client, negativeTaxId);

    await expectModifierConstraint(client, 'menu_item_modifiers_kind', async (tx, itemId) => {
      const modifierId = crypto.randomUUID();
      await tx`
        insert into menu_item_modifiers (
          id, menu_item_id, name, kind, ingredient_id, price_amount, price_currency, position
        )
        values (${modifierId}, ${itemId}, 'Queso', 'topping', null, 100, 'MXN', 0)
      `;
    });

    await expectModifierConstraint(client, 'menu_item_modifiers_price_by_kind', async (tx, itemId) => {
      const modifierId = crypto.randomUUID();
      await tx`
        insert into menu_item_modifiers (
          id, menu_item_id, name, kind, ingredient_id, price_amount, price_currency, position
        )
        values (${modifierId}, ${itemId}, 'Queso', 'extra', null, null, null, 0)
      `;
    });

    await expectModifierConstraint(client, 'menu_item_modifiers_price_by_kind', async (tx, itemId) => {
      const ingredientId = crypto.randomUUID();
      const modifierId = crypto.randomUUID();
      await tx`
        insert into menu_item_ingredients (id, menu_item_id, name, position)
        values (${ingredientId}, ${itemId}, 'Cilantro', 0)
      `;
      await tx`
        insert into menu_item_modifiers (
          id, menu_item_id, name, kind, ingredient_id, price_amount, price_currency, position
        )
        values (${modifierId}, ${itemId}, 'Cilantro', 'exclusion', ${ingredientId}, 100, 'MXN', 0)
      `;
    });
  });
});

function openCatalog(port: number): CatalogClient {
  const protoPath = nodeRequire.resolve('@restaurante/contracts/menu.proto');
  const definition = loadSync(protoPath, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: false,
    oneofs: true,
  });
  const loaded = loadPackageDefinition(definition) as unknown as {
    restaurante: {
      menu: {
        v1: {
          MenuCatalogService: new (address: string, creds: ReturnType<typeof credentials.createInsecure>) => CatalogClient;
        };
      };
    };
  };
  return new loaded.restaurante.menu.v1.MenuCatalogService(`127.0.0.1:${port}`, credentials.createInsecure());
}

function getMenuItem(catalog: CatalogClient, id: string): Promise<SnapshotReply> {
  return new Promise((resolve, reject) => {
    catalog.getMenuItem({ id }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      if (response === undefined) {
        reject(new Error('GetMenuItem returned an empty snapshot'));
        return;
      }
      resolve(response);
    });
  });
}

async function expectModifierConstraint(
  client: Sql,
  constraint: string,
  insertModifier: (tx: TransactionSql, itemId: string) => Promise<void>,
): Promise<void> {
  const itemId = crypto.randomUUID();
  await expectConstraint(constraint, () =>
    client.begin(async (tx) => {
      await tx`
        insert into menu_items (id, name, price_amount, price_currency, tax_basis_points, active)
        values (${itemId}, 'Tacos', 1000, 'MXN', 0, true)
      `;
      await insertModifier(tx, itemId);
    }),
  );
  await expectGone(client, itemId);
}

async function expectConstraint(constraint: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    const pg = postgresError(error);
    expect(pg.code).toBe('23514');
    expect(pg.constraint_name).toBe(constraint);
    return;
  }
  throw new Error(`expected check ${constraint}`);
}

async function expectGone(client: Sql, itemId: string): Promise<void> {
  const rows = await client`select id from menu_items where id = ${itemId}`;
  expect(rows).toHaveLength(0);
}

function postgresError(error: unknown): { code?: string; constraint_name?: string } {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return error as { code?: string; constraint_name?: string };
  }
  return {};
}

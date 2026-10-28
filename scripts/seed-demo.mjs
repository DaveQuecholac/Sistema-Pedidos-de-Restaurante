#!/usr/bin/env node
/**
 * Seed idempotente para recorrer el corte: 6 mesas y el plato «Tacos».
 * Con el gateway encendido, además abre una orden, la manda a cocina,
 * comprueba el total y la cobra en efectivo.
 * No vive en casos de uso. Uso: pnpm db:seed
 * En pnpm dev / restart solo corre el catálogo (--catalog).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const apiRoot = resolve(root, "apps/api");
const require = createRequire(resolve(apiRoot, "package.json"));
const postgres = require("postgres");

const DISH_ID = "seed-tacos";
const INGREDIENT_ID = "seed-tacos-cilantro";
const EXTRA_ID = "seed-tacos-queso";
const EXCLUSION_ID = "seed-tacos-sin-cilantro";
const PRICE_AMOUNT = 1000;
const CHECK_EXTERNAL_ID = "seed-piso";
const PROBE_TABLE_ID = "6";
const catalogOnly = process.argv.includes("--catalog");

function readEnvKey(path, key) {
  if (!existsSync(path)) {
    return undefined;
  }

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    if (trimmed.slice(0, eq).trim() !== key) {
      continue;
    }
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }

  return undefined;
}

function withDatabase(url, name) {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

function ordersDatabaseUrl() {
  return (
    process.env.DATABASE_URL ??
    readEnvKey(resolve(apiRoot, ".env"), "DATABASE_URL") ??
    "postgresql://postgres:postgres@localhost:5432/restaurante"
  );
}

function databaseUrl(envKey, envFile, name) {
  if (process.env[envKey]) {
    return process.env[envKey];
  }
  const fromFile = readEnvKey(resolve(root, envFile), envKey);
  if (fromFile) {
    return fromFile;
  }
  return withDatabase(ordersDatabaseUrl(), name);
}

function runTablesSeed() {
  const result = spawnSync(process.execPath, [resolve(root, "scripts/ensure-salon-tables.mjs")], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function seedDish(sql) {
  await sql`
    INSERT INTO menu_items (id, name, price_amount, price_currency, tax_basis_points, active)
    VALUES (${DISH_ID}, 'Tacos', ${PRICE_AMOUNT}, 'MXN', 0, true)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      price_amount = EXCLUDED.price_amount,
      price_currency = EXCLUDED.price_currency,
      tax_basis_points = EXCLUDED.tax_basis_points,
      active = true
  `;
  await sql`
    INSERT INTO menu_item_ingredients (id, menu_item_id, name, position)
    VALUES (${INGREDIENT_ID}, ${DISH_ID}, 'Cilantro', 0)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO menu_item_modifiers (
      id, menu_item_id, name, kind, ingredient_id, price_amount, price_currency, position
    )
    VALUES
      (${EXTRA_ID}, ${DISH_ID}, 'Queso', 'extra', null, 500, 'MXN', 0),
      (${EXCLUSION_ID}, ${DISH_ID}, 'Cilantro', 'exclusion', ${INGREDIENT_ID}, null, null, 1)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      ingredient_id = EXCLUDED.ingredient_id,
      price_amount = EXCLUDED.price_amount,
      price_currency = EXCLUDED.price_currency,
      position = EXCLUDED.position
  `;

  const [{ count }] = await sql`
    SELECT count(*)::int AS count
    FROM menu_items
    WHERE id = ${DISH_ID} AND active = true AND price_amount = ${PRICE_AMOUNT}
  `;
  if (count !== 1) {
    console.error("El seed no dejó el plato Tacos activo.");
    process.exit(1);
  }
  console.log(`Plato seed: ${DISH_ID} «Tacos» ${PRICE_AMOUNT} MXN, impuesto 0.`);
}

const gateway = process.env.GATEWAY_URL ?? "http://localhost:3000";

async function call(method, path, body) {
  let response;
  try {
    response = await fetch(new URL(path, gateway), {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    console.error(`El gateway ${gateway} no respondió. Arranca con pnpm dev y vuelve a correr pnpm db:seed.`);
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const text = await response.text();
  const payload = text === "" ? null : JSON.parse(text);
  if (!response.ok) {
    console.error(`${method} ${path} respondió ${response.status}`);
    console.error(payload);
    process.exit(1);
  }
  return payload;
}

async function assertCatalog() {
  const tables = await call("GET", "/tables");
  const ids = new Set(tables.filter((table) => table.active).map((table) => table.id));
  for (const id of ["1", "2", "3", "4", "5", "6"]) {
    if (!ids.has(id)) {
      console.error(`Falta la mesa activa ${id} en GET /tables.`);
      process.exit(1);
    }
  }

  const table = await call("GET", `/tables/${PROBE_TABLE_ID}`);
  if (table.id !== PROBE_TABLE_ID || table.active !== true) {
    console.error("GET /tables/6 no devolvió la mesa seed activa.");
    process.exit(1);
  }

  const items = await call("GET", "/menu-items");
  const dish = items.find((item) => item.id === DISH_ID);
  if (!dish || dish.active !== true || dish.price.amount !== PRICE_AMOUNT) {
    console.error("GET /menu-items no devolvió Tacos activo a 1000 MXN.");
    process.exit(1);
  }
}

async function probeSalon() {
  const opened = await call("POST", "/orders", { tableId: PROBE_TABLE_ID });
  const cancelled = await call("POST", `/orders/${opened.id}/cancel`, {});
  if (cancelled.status !== "CANCELLED") {
    console.error("La sonda de salón no quedó CANCELLED.");
    process.exit(1);
  }
  console.log(`Salón: mesa ${PROBE_TABLE_ID} abrió la orden ${opened.id} y se canceló.`);
}

async function advance(orderId) {
  let order = await call("GET", `/orders/${orderId}`);
  if (order.status === "CANCELLED") {
    console.error(`La orden seed ${orderId} está CANCELLED. No se reanuda.`);
    process.exit(1);
  }
  if (order.status === "OPEN" && order.lines.length === 0) {
    order = await call("POST", `/orders/${orderId}/lines`, {
      menuItemId: DISH_ID,
      quantity: 1,
      modifierIds: [],
    });
  }
  if (order.status === "OPEN") {
    order = await call("POST", `/orders/${orderId}/send-to-kitchen`, {});
  }
  if (order.status === "SENT_TO_KITCHEN") {
    order = await call("POST", `/orders/${orderId}/begin-cooking`, {});
  }
  if (order.status === "IN_KITCHEN") {
    order = await call("POST", `/orders/${orderId}/mark-ready`, {});
  }

  const totals = await call("GET", `/orders/${orderId}/totals`);
  if (totals.total.amount !== PRICE_AMOUNT || totals.total.currency !== "MXN") {
    console.error("El total de la orden seed no es 1000 MXN.", totals.total);
    process.exit(1);
  }

  if (order.status === "READY") {
    const closed = await call("POST", `/orders/${orderId}/close`, {
      expectedTotal: PRICE_AMOUNT,
      payment: { method: "cash", tendered: PRICE_AMOUNT },
    });
    if (closed.status !== "CLOSED" || closed.payment.method !== "cash") {
      console.error("El cobro seed no quedó CLOSED en efectivo.", closed);
      process.exit(1);
    }
    order = { ...order, status: "CLOSED" };
  }

  if (order.status !== "CLOSED") {
    console.error(`La orden seed quedó en ${order.status}, no en CLOSED.`);
    process.exit(1);
  }
  return totals.total.amount;
}

async function assertOutbox(sql, orderId) {
  const rows = await sql`
    SELECT event_type, published_at
    FROM order_outbox
    WHERE order_id = ${orderId}
  `;
  if (rows.length !== 1 || rows[0].event_type !== "OrderSentToKitchen") {
    console.error("La orden seed no dejó una sola fila OrderSentToKitchen.", rows);
    process.exit(1);
  }
  const published = rows[0].published_at === null ? "sin publicar" : "publicada";
  console.log(`Cocina: orden ${orderId} CLOSED, total ${PRICE_AMOUNT} MXN, aviso ${published}.`);
}

async function verify(orders) {
  await assertCatalog();

  const existing = await orders`
    SELECT id, status
    FROM orders
    WHERE external_order_id = ${CHECK_EXTERNAL_ID}
  `;

  let orderId;
  if (existing.length === 0) {
    await probeSalon();
    const opened = await call("POST", "/orders", { externalOrderId: CHECK_EXTERNAL_ID });
    orderId = opened.id;
  } else {
    orderId = existing[0].id;
    console.log(`Orden seed ya existe: ${orderId} (${existing[0].status}). Se reanuda si falta.`);
  }

  await advance(orderId);
  await assertOutbox(orders, orderId);
}

runTablesSeed();
const menu = postgres(databaseUrl("MENU_DATABASE_URL", "apps/menu/.env", "menu"), { max: 1 });
try {
  await seedDish(menu);
} finally {
  await menu.end({ timeout: 5 });
}

if (catalogOnly) {
  process.exit(0);
}

const orders = postgres(ordersDatabaseUrl(), { max: 1 });
try {
  await verify(orders);
} finally {
  await orders.end({ timeout: 5 });
}

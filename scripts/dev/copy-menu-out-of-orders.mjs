#!/usr/bin/env node
/**
 * Una sola vez: copia menu_items, menu_item_ingredients y menu_item_modifiers
 * desde la base de la API hacia la base menu. No vive junto a un caso de uso.
 * Se puede correr dos veces: la segunda no duplica (el id ya existe).
 * Si no hay filas, termina en cero.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const apiRoot = resolve(root, "apps/api");
const menuRoot = resolve(root, "apps/menu");
const require = createRequire(resolve(apiRoot, "package.json"));

const ITEM_COLUMNS = ["id", "name", "price_amount", "price_currency", "tax_basis_points", "active"];
const INGREDIENT_COLUMNS = ["id", "menu_item_id", "name", "position"];
const MODIFIER_COLUMNS = [
  "id",
  "menu_item_id",
  "name",
  "kind",
  "ingredient_id",
  "price_amount",
  "price_currency",
  "position",
];

function readEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }
  const values = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function databaseName(url) {
  return new URL(url).pathname.replace(/^\//, "");
}

function withDatabase(url, name) {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const apiEnv = readEnvFile(resolve(apiRoot, ".env"));
const menuEnv = readEnvFile(resolve(menuRoot, ".env"));
const ordersUrl = process.env.DATABASE_URL ?? apiEnv.DATABASE_URL;
if (!ordersUrl) {
  console.error("DATABASE_URL no está definida y no hay apps/api/.env");
  process.exit(1);
}

let menuUrl = process.env.MENU_DATABASE_URL ?? menuEnv.MENU_DATABASE_URL;
if (!menuUrl) {
  menuUrl = withDatabase(ordersUrl, "menu");
  console.log("MENU_DATABASE_URL no estaba definida; se usa la base menu del mismo servidor.");
}

const postgres = require("postgres");
const orders = postgres(ordersUrl, { max: 1 });
const menu = postgres(menuUrl, { max: 1 });

try {
  const items = await orders`
    SELECT id, name, price_amount, price_currency, tax_basis_points, active
    FROM menu_items
    ORDER BY id
  `;
  const ingredients = await orders`
    SELECT id, menu_item_id, name, position
    FROM menu_item_ingredients
    ORDER BY id
  `;
  const modifiers = await orders`
    SELECT id, menu_item_id, name, kind, ingredient_id, price_amount, price_currency, position
    FROM menu_item_modifiers
    ORDER BY id
  `;

  const copied = await menu.begin(async (tx) => {
    const itemCopy = await copyRows(tx, "menu_items", items, ITEM_COLUMNS);
    const ingredientCopy = await copyRows(tx, "menu_item_ingredients", ingredients, INGREDIENT_COLUMNS);
    const modifierCopy = await copyRows(tx, "menu_item_modifiers", modifiers, MODIFIER_COLUMNS);
    const itemMismatches = await countMismatches(tx, "menu_items", items, ITEM_COLUMNS);
    const ingredientMismatches = await countMismatches(tx, "menu_item_ingredients", ingredients, INGREDIENT_COLUMNS);
    const modifierMismatches = await countMismatches(tx, "menu_item_modifiers", modifiers, MODIFIER_COLUMNS);
    if (itemMismatches !== 0 || ingredientMismatches !== 0 || modifierMismatches !== 0) {
      throw new Error(
        `La copia no coincide: ${itemMismatches} platos, ${ingredientMismatches} ingredientes y ${modifierMismatches} modificadores sin pareja.`,
      );
    }
    return { itemCopy, ingredientCopy, modifierCopy };
  });

  console.log(line("Platos", items.length, copied.itemCopy));
  console.log(line("Ingredientes", ingredients.length, copied.ingredientCopy));
  console.log(line("Modificadores", modifiers.length, copied.modifierCopy));
  console.log(`Bases: ${databaseName(ordersUrl)} -> ${databaseName(menuUrl)}. Parejas en cero diferencias.`);
} finally {
  await orders.end({ timeout: 5 });
  await menu.end({ timeout: 5 });
}

function line(label, read, copy) {
  return `${label}: ${read} leídos, ${copy.inserted} insertados, ${copy.alreadyThere} ya estaban.`;
}

async function copyRows(menuDb, table, rows, columns) {
  let inserted = 0;
  let alreadyThere = 0;
  for (const row of rows) {
    const written = await menuDb`
      INSERT INTO ${menuDb(table)} ${menuDb(row, ...columns)}
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    if (written.length === 1) {
      inserted += 1;
    } else {
      alreadyThere += 1;
    }
  }
  return { inserted, alreadyThere };
}

async function countMismatches(menuDb, table, rows, columns) {
  if (rows.length === 0) {
    return 0;
  }
  const ids = rows.map((row) => row.id);
  const copied = await menuDb`
    SELECT * FROM ${menuDb(table)}
    WHERE id = ANY(${ids})
  `;
  const byId = new Map(copied.map((row) => [row.id, row]));
  let mismatches = 0;
  for (const row of rows) {
    const copy = byId.get(row.id);
    const pair = copy !== undefined && columns.every((column) => copy[column] === row[column]);
    if (!pair) {
      mismatches += 1;
    }
  }
  return mismatches;
}

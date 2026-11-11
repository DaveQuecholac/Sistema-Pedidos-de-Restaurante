#!/usr/bin/env node
/**
 * Una sola vez: copia tables desde la base de la API hacia la base salon.
 * No vive junto a un caso de uso.
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
const salonRoot = resolve(root, "apps/salon");
const require = createRequire(resolve(apiRoot, "package.json"));

const COLUMNS = ["id", "label", "zone", "active"];

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
const salonEnv = readEnvFile(resolve(salonRoot, ".env"));
const ordersUrl = process.env.DATABASE_URL ?? apiEnv.DATABASE_URL;
if (!ordersUrl) {
  console.error("DATABASE_URL no está definida y no hay apps/api/.env");
  process.exit(1);
}

let salonUrl = process.env.SALON_DATABASE_URL ?? salonEnv.SALON_DATABASE_URL;
if (!salonUrl) {
  salonUrl = withDatabase(ordersUrl, "salon");
  console.log("SALON_DATABASE_URL no estaba definida; se usa la base salon del mismo servidor.");
}

const postgres = require("postgres");
const orders = postgres(ordersUrl, { max: 1 });
const salon = postgres(salonUrl, { max: 1 });

try {
  const tables = await orders`
    SELECT id, label, zone, active
    FROM tables
    ORDER BY id
  `;

  const copied = await salon.begin(async (tx) => {
    const tableCopy = await copyRows(tx, tables);
    const mismatches = await countMismatches(tx, tables);
    if (mismatches !== 0) {
      throw new Error(`La copia no coincide: ${mismatches} mesas sin pareja.`);
    }
    return tableCopy;
  });

  console.log(line("Mesas", tables.length, copied));
  console.log(`Bases: ${databaseName(ordersUrl)} -> ${databaseName(salonUrl)}. Parejas en cero diferencias.`);
} finally {
  await orders.end({ timeout: 5 });
  await salon.end({ timeout: 5 });
}

function line(label, read, copy) {
  return `${label}: ${read} leídos, ${copy.inserted} insertados, ${copy.alreadyThere} ya estaban.`;
}

async function copyRows(salonDb, rows) {
  let inserted = 0;
  let alreadyThere = 0;
  for (const row of rows) {
    const written = await salonDb`
      INSERT INTO tables ${salonDb(row, ...COLUMNS)}
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

async function countMismatches(salonDb, rows) {
  if (rows.length === 0) {
    return 0;
  }
  const ids = rows.map((row) => row.id);
  const copied = await salonDb`
    SELECT id, label, zone, active
    FROM tables
    WHERE id = ANY(${ids})
  `;
  const byId = new Map(copied.map((row) => [row.id, row]));
  let mismatches = 0;
  for (const row of rows) {
    const copy = byId.get(row.id);
    const pair = copy !== undefined && COLUMNS.every((column) => copy[column] === row[column]);
    if (!pair) {
      mismatches += 1;
    }
  }
  return mismatches;
}

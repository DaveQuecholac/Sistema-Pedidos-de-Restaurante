#!/usr/bin/env node
/**
 * Una sola vez: copia order_payments y table_sitting_payments a la base payments
 * y rellena payment_id / payment_reference. No vive junto a un caso de uso.
 * Se puede correr dos veces: la segunda no duplica (payment_id ya existe).
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const apiRoot = resolve(root, "apps/api");
const paymentsRoot = resolve(root, "apps/payments");
const require = createRequire(resolve(apiRoot, "package.json"));

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
const paymentsEnv = readEnvFile(resolve(paymentsRoot, ".env"));
const ordersUrl = process.env.DATABASE_URL ?? apiEnv.DATABASE_URL;
if (!ordersUrl) {
  console.error("DATABASE_URL no está definida y no hay apps/api/.env");
  process.exit(1);
}

let paymentsUrl = process.env.PAYMENTS_DATABASE_URL ?? paymentsEnv.PAYMENTS_DATABASE_URL;
if (!paymentsUrl) {
  paymentsUrl = withDatabase(ordersUrl, "payments");
  console.log("PAYMENTS_DATABASE_URL no estaba definida; se usa la base payments del mismo servidor.");
}

const postgres = require("postgres");
const orders = postgres(ordersUrl, { max: 1 });
const payments = postgres(paymentsUrl, { max: 1 });

try {
  const orderPayments = await orders`
    SELECT order_id, payment_id, method, amount, currency, tendered_amount, card_last4,
           payer_reference, reference, paid_at
    FROM order_payments
    ORDER BY order_id
  `;
  const sittingPayments = await orders`
    SELECT sitting_id, payment_id, method, amount, currency, tendered_amount, card_last4,
           payer_reference, reference, paid_at
    FROM table_sitting_payments
    ORDER BY sitting_id
  `;

  const orderCopy = await copyRows(payments, orderPayments, "order_id");
  const sittingCopy = await copyRows(payments, sittingPayments, "sitting_id");

  await fillColumns(orders, "orders", "id", orderPayments, "order_id");
  await fillColumns(orders, "table_sittings", "id", sittingPayments, "sitting_id");

  const orderMismatches = await countOrderMismatches(orders, payments);
  const sittingMismatches = await countSittingMismatches(orders, payments);
  if (orderMismatches !== 0 || sittingMismatches !== 0) {
    throw new Error(
      `La copia no coincide: ${orderMismatches} órdenes y ${sittingMismatches} cuentas sin pareja.`,
    );
  }

  console.log(
    `Órdenes: ${orderPayments.length} leídas, ${orderCopy.inserted} insertadas, ${orderCopy.alreadyThere} ya estaban.`,
  );
  console.log(
    `Cuentas: ${sittingPayments.length} leídas, ${sittingCopy.inserted} insertadas, ${sittingCopy.alreadyThere} ya estaban.`,
  );
  console.log(`Bases: ${databaseName(ordersUrl)} -> ${databaseName(paymentsUrl)}. Parejas en cero diferencias.`);
} finally {
  await orders.end({ timeout: 5 });
  await payments.end({ timeout: 5 });
}

async function copyRows(paymentsDb, rows, subjectKey) {
  let inserted = 0;
  let alreadyThere = 0;
  for (const row of rows) {
    const written = await paymentsDb`
      INSERT INTO payments (
        payment_id, subject_id, method, amount, currency, tendered_amount, card_last4,
        payer_reference, reference, paid_at, status
      ) VALUES (
        ${row.payment_id}, ${row[subjectKey]}, ${row.method}, ${row.amount}, ${row.currency},
        ${row.tendered_amount}, ${row.card_last4}, ${row.payer_reference}, ${row.reference},
        ${row.paid_at}, 'approved'
      )
      ON CONFLICT (payment_id) DO NOTHING
      RETURNING payment_id
    `;
    if (written.length === 1) {
      inserted += 1;
    } else {
      alreadyThere += 1;
    }
  }
  return { inserted, alreadyThere };
}

async function fillColumns(ordersDb, tableName, idColumn, rows, subjectKey) {
  if (rows.length === 0) {
    return;
  }
  await ordersDb.begin(async (tx) => {
    for (const row of rows) {
      const updated = await tx.unsafe(
        `UPDATE ${tableName}
         SET payment_id = $1, payment_reference = $2
         WHERE ${idColumn} = $3`,
        [row.payment_id, row.reference, row[subjectKey]],
      );
      if (updated.count !== 1) {
        throw new Error(`${tableName} ${row[subjectKey]} no recibió las columnas de pago`);
      }
    }
  });
}

async function countOrderMismatches(ordersDb, paymentsDb) {
  const source = await ordersDb`
    SELECT op.order_id, op.payment_id, op.reference, o.payment_id AS stored_id, o.payment_reference AS stored_reference
    FROM order_payments op
    JOIN orders o ON o.id = op.order_id
  `;
  return countMismatches(paymentsDb, source, "order_id");
}

async function countSittingMismatches(ordersDb, paymentsDb) {
  const source = await ordersDb`
    SELECT sp.sitting_id, sp.payment_id, sp.reference, s.payment_id AS stored_id, s.payment_reference AS stored_reference
    FROM table_sitting_payments sp
    JOIN table_sittings s ON s.id = sp.sitting_id
  `;
  return countMismatches(paymentsDb, source, "sitting_id");
}

async function countMismatches(paymentsDb, source, subjectKey) {
  if (source.length === 0) {
    return 0;
  }
  const ids = source.map((row) => row.payment_id);
  const copied = await paymentsDb`
    SELECT payment_id, subject_id, status, reference
    FROM payments
    WHERE payment_id = ANY(${ids})
  `;
  const byId = new Map(copied.map((row) => [row.payment_id, row]));
  let mismatches = 0;
  for (const row of source) {
    const copy = byId.get(row.payment_id);
    const pair =
      copy !== undefined &&
      copy.subject_id === row[subjectKey] &&
      copy.status === "approved" &&
      copy.reference === row.reference &&
      row.stored_id === row.payment_id &&
      row.stored_reference === row.reference;
    if (!pair) {
      mismatches += 1;
    }
  }
  return mismatches;
}

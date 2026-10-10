#!/usr/bin/env node
/**
 * Seed idempotente del catálogo inicial de mesas (Gen 1 / mesas tarea 2).
 * Inserta mesas "1"…"6" en zona "Salón" con ON CONFLICT DO NOTHING.
 * No vive en casos de uso. Uso: pnpm db:ensure-tables (también en pnpm dev / restart).
 */
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const apiRoot = resolve(root, "apps/api");
const require = createRequire(resolve(apiRoot, "package.json"));

const SEED = ["1", "2", "3", "4", "5", "6"].map((id) => ({
  id,
  label: id,
  zone: "Salón",
}));

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envPath = resolve(apiRoot, ".env");
  if (!existsSync(envPath)) {
    console.error("DATABASE_URL no está definida y no hay apps/api/.env");
    process.exit(1);
  }

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
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
    if (key === "DATABASE_URL") {
      return value;
    }
  }

  console.error("DATABASE_URL no aparece en apps/api/.env");
  process.exit(1);
}

const postgres = require("postgres");
const url = loadDatabaseUrl();
const sql = postgres(url, { max: 1 });

try {
  for (const table of SEED) {
    await sql`
      INSERT INTO "tables" (id, label, zone, active)
      VALUES (${table.id}, ${table.label}, ${table.zone}, true)
      ON CONFLICT (id) DO NOTHING
    `;
  }

  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM "tables" WHERE id = ANY(${SEED.map((t) => t.id)})
  `;

  console.log(`Mesas seed: ${SEED.length} objetivo; ${count} presentes (ids 1–6).`);
  if (count !== SEED.length) {
    console.error("El seed no dejó las 6 mesas esperadas.");
    process.exit(1);
  }
} finally {
  await sql.end({ timeout: 5 });
}

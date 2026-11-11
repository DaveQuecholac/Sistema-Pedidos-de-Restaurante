#!/usr/bin/env node
/**
 * Root PM2 helper: gateway en :3000, api en :3001 y gRPC :50054, pagos en gRPC :50051,
 * menú en :3002 y gRPC :50052, salón en :3003 y gRPC :50053, web en https://restaurante.localhost.
 * Root: pnpm dev | dev:stop | dev:restart | dev:status | dev:logs
 * Usage: node scripts/pm2-root.mjs start|stop|restart|status|logs
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const ecosystem = resolve(root, "ecosystem.config.cjs");
const logsDir = resolve(root, "logs/pm2");
const APP_NAMES = [
  "restaurante-api",
  "restaurante-payments",
  "restaurante-menu",
  "restaurante-salon",
  "restaurante-gateway",
  "restaurante-web",
];

function resolvePm2Bin() {
  const candidate = resolve(root, "node_modules/pm2/bin/pm2");
  if (!existsSync(candidate)) {
    console.error("pm2 no encontrado. Corre: pnpm install");
    process.exit(1);
  }
  return candidate;
}

function runPm2(args) {
  const result = spawnSync(process.execPath, [resolvePm2Bin(), ...args], {
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

function ensureLogsDir() {
  mkdirSync(logsDir, { recursive: true });
}

function ensurePostgres() {
  const result = spawnSync(process.execPath, [resolve(root, "scripts/ensure-postgres.mjs")], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureDemoCatalog() {
  const result = spawnSync(process.execPath, [resolve(root, "scripts/seed-demo.mjs"), "--catalog"], {
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

function printUrls() {
  console.log("Gateway http://localhost:3000");
  console.log("API     http://localhost:3001  grpc://localhost:50054");
  console.log("Pagos   grpc://localhost:50051");
  console.log("Menú    http://localhost:3002  grpc://localhost:50052");
  console.log("Salón   http://localhost:3003  grpc://localhost:50053");
  console.log("Web     https://restaurante.localhost");
  console.log("Logs: pnpm dev:logs | stop: pnpm dev:stop");
}

const command = process.argv[2] ?? "start";

switch (command) {
  case "start":
    ensurePostgres();
    ensureDemoCatalog();
    ensureLogsDir();
    runPm2(["start", ecosystem]);
    printUrls();
    break;
  case "stop":
    runPm2(["stop", ...APP_NAMES]);
    break;
  case "restart":
    ensurePostgres();
    ensureDemoCatalog();
    ensureLogsDir();
    runPm2(["startOrRestart", ecosystem, "--update-env"]);
    printUrls();
    break;
  case "status":
    runPm2(["ls"]);
    break;
  case "logs":
    runPm2(["logs", ...APP_NAMES, "--lines", "80"]);
    break;
  default:
    console.error(`Uso: node scripts/pm2-root.mjs <start|stop|restart|status|logs>`);
    process.exit(1);
}

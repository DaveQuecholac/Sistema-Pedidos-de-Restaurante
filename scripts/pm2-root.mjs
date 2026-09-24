#!/usr/bin/env node
/**
 * Root PM2 helper for api + web (no portless).
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
const APP_NAMES = ["restaurante-api", "restaurante-web"];

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

const command = process.argv[2] ?? "start";

switch (command) {
  case "start":
    ensureLogsDir();
    runPm2(["start", ecosystem]);
    console.log("API  http://localhost:3001");
    console.log("Web  http://localhost:3000");
    console.log("Logs: pnpm dev:logs | stop: pnpm dev:stop");
    break;
  case "stop":
    runPm2(["stop", ...APP_NAMES]);
    break;
  case "restart":
    ensureLogsDir();
    runPm2(["restart", ...APP_NAMES]);
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

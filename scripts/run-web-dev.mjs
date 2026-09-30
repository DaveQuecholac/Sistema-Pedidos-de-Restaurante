#!/usr/bin/env node
/**
 * Arranque de Next para PM2. El puerto y el host los pone
 * scripts/pm2-portless-run.mjs; Next lee PORT si no se le pasa --port.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/web");
const nextBin = [
  resolve(appRoot, "node_modules/next/dist/bin/next"),
  resolve(appRoot, "../../node_modules/next/dist/bin/next"),
].find((candidate) => existsSync(candidate));

if (!nextBin) {
  console.error("No se encontró el binario de Next en apps/web.");
  process.exit(1);
}

const child = spawn(process.execPath, [nextBin, "dev"], {
  cwd: appRoot,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

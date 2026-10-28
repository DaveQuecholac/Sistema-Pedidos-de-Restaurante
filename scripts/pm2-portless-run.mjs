#!/usr/bin/env node
/**
 * PM2 entry (recommended on Windows and Linux): register hostname→PORT with
 * the running portless proxy, then run the app **without** the `portless` CLI.
 *
 * Copy to: <repo>/scripts/pm2-portless-run.mjs  (shared) or <app>/scripts/…
 *
 * Why not `portless` CLI under PM2:
 * - Windows: CLI spawns cmd.exe without windowsHide → visible consoles; closing
 *   them kills the child → PM2 autorestart. windowsHide on the ecosystem is not enough.
 * - Linux: CLI uses /bin/sh with detached:true (no GUI windows) — still bypass for a
 *   single Win+Linux path and a cleaner process tree under PM2.
 * - Ctrl+C on `pnpm dev` only stops log follow — use `dev:stop`.
 * - ~/.portless must be writable by the PM2 user (root proxy on :443 → EACCES).
 *
 * Alternative upstream: patch portless spawnCommand to pass windowsHide: true.
 *
 * Usage (cwd = app via ecosystem):
 *   node <path>/pm2-portless-run.mjs <PORTLESS_NAME> <script.mjs|js> [scriptArgs…]
 *
 * Requires: portless proxy already running (prefer OS service via
 * `iokoia install portless`; one-shot: `portless proxy start`).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const portlessName = process.argv[2];
const scriptPath = process.argv[3];
const scriptArgs = process.argv.slice(4);

if (!portlessName || !scriptPath) {
  console.error(
    "Usage: node pm2-portless-run.mjs <PORTLESS_NAME> <script> [scriptArgs…]",
  );
  process.exit(2);
}

const hostname = portlessName.includes(".")
  ? portlessName.endsWith(".localhost")
    ? portlessName
    : `${portlessName}.localhost`
  : `${portlessName}.localhost`;

const stateDir =
  process.env.PORTLESS_STATE_DIR?.trim() || path.join(os.homedir(), ".portless");
const routesPath = path.join(stateDir, "routes.json");
const proxyPortPath = path.join(stateDir, "proxy.port");
const caPath = path.join(stateDir, "ca.pem");

function proxyListenPort() {
  try {
    const raw = readFileSync(proxyPortPath, "utf8").trim();
    const port = Number(raw);
    if (Number.isFinite(port) && port > 0) return port;
  } catch {
    // assume privileged default
  }
  return 443;
}

function publicUrl() {
  const port = proxyListenPort();
  if (port === 443) return `https://${hostname}/`;
  return `https://${hostname}:${port}/`;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

function loadRoutes() {
  if (!existsSync(routesPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(routesPath, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveRoutes(routes) {
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
  try {
    writeFileSync(routesPath, `${JSON.stringify(routes, null, 2)}\n`, "utf8");
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? err.code : "";
    if (code === "EACCES" || code === "EPERM") {
      console.error(
        `Cannot write ${routesPath} (${code}).`,
      );
      console.error(
        "The portless proxy state dir must be writable by the user running PM2.",
      );
      console.error(
        "If the proxy was started as root (e.g. port 443), fix ownership, e.g.:",
      );
      console.error(`  sudo chown -R "$(whoami):$(whoami)" "${stateDir}"`);
      console.error(
        "Or run the proxy on a non-privileged port so state stays user-owned.",
      );
      process.exit(1);
    }
    throw err;
  }
}

function registerRoute(port) {
  const routes = loadRoutes().filter((r) => r?.hostname !== hostname);
  routes.push({ hostname, port, pid: process.pid });
  saveRoutes(routes);
}

function unregisterRoute() {
  try {
    const routes = loadRoutes().filter((r) => r?.hostname !== hostname);
    saveRoutes(routes);
  } catch {
    // best-effort
  }
}

if (!existsSync(proxyPortPath) && !existsSync(path.join(stateDir, "proxy.pid"))) {
  console.error(
    "portless proxy does not look running (missing ~/.portless/proxy.port).",
  );
  console.error(
    "Preferred: iokoia install portless  (or: portless service install)",
  );
  console.error("One-shot: portless proxy start");
  process.exit(1);
}

if (!existsSync(scriptPath)) {
  console.error(`Script not found: ${scriptPath}`);
  process.exit(1);
}

const port = await findFreePort();
registerRoute(port);

const url = publicUrl();
console.log(`pm2-portless-run: ${hostname} → 127.0.0.1:${port}`);
console.log(`Public URL: ${url}`);

const env = {
  ...process.env,
  PORT: String(port),
  HOST: "127.0.0.1",
  PORTLESS_URL: url.replace(/\/$/, ""),
};
if (!env.NODE_EXTRA_CA_CERTS && existsSync(caPath)) {
  env.NODE_EXTRA_CA_CERTS = caPath;
}

const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
  windowsHide: true,
  shell: false,
});

let cleaning = false;
function cleanup() {
  if (cleaning) return;
  cleaning = true;
  unregisterRoute();
}

child.on("exit", (code, signal) => {
  cleanup();
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  console.error(err.message);
  cleanup();
  process.exit(1);
});

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    cleanup();
    try {
      child.kill(sig);
    } catch {
      // ignore
    }
  });
}

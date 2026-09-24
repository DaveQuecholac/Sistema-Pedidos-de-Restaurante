/**
 * PM2: api (Nest :3001) + web (Next :3000) in watch/dev mode.
 * Root scripts: pnpm dev | dev:stop | dev:status | dev:logs | dev:restart
 */
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { execSync } = require("node:child_process");

const root = __dirname;

function resolvePnpm() {
  const local = resolve(root, "node_modules/.bin/pnpm");
  if (existsSync(local)) return local;
  try {
    const fromPath = execSync("command -v pnpm", {
      encoding: "utf8",
      env: process.env,
    }).trim();
    if (fromPath && existsSync(fromPath)) return fromPath;
  } catch {
    // fall through
  }
  throw new Error(
    "pnpm not found (PATH or node_modules/.bin). Install pnpm and retry.",
  );
}

const pnpm = resolvePnpm();

module.exports = {
  apps: [
    {
      name: "restaurante-api",
      cwd: root,
      script: pnpm,
      args: ["--filter", "@restaurante/api", "dev"],
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: "5s",
      out_file: resolve(root, "logs/pm2/api-out.log"),
      error_file: resolve(root, "logs/pm2/api-error.log"),
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "development",
        PORT: "3001",
      },
    },
    {
      name: "restaurante-web",
      cwd: root,
      script: pnpm,
      args: ["--filter", "@restaurante/web", "dev"],
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: "5s",
      out_file: resolve(root, "logs/pm2/web-out.log"),
      error_file: resolve(root, "logs/pm2/web-error.log"),
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};

/**
 * PM2: gateway (REST :3000) + api (Nest :3001, gRPC :50054) + pagos (gRPC localhost:50051)
 * + menú (REST :3002, gRPC localhost:50052) + salón (REST :3003, gRPC localhost:50053)
 * + web (Next vía portless, https://restaurante.localhost).
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
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgresql://postgres:postgres@localhost:5432/restaurante",
        PAYMENTS_GRPC_URL: process.env.PAYMENTS_GRPC_URL ?? "localhost:50051",
        MENU_GRPC_URL: process.env.MENU_GRPC_URL ?? "localhost:50052",
        SALON_GRPC_URL: process.env.SALON_GRPC_URL ?? "localhost:50053",
        ORDERS_GRPC_URL: process.env.ORDERS_GRPC_URL ?? "localhost:50054",
      },
    },
    {
      name: "restaurante-payments",
      cwd: root,
      script: pnpm,
      args: ["--filter", "@restaurante/payments", "dev"],
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: "5s",
      out_file: resolve(root, "logs/pm2/payments-out.log"),
      error_file: resolve(root, "logs/pm2/payments-error.log"),
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "development",
        PAYMENTS_DATABASE_URL:
          process.env.PAYMENTS_DATABASE_URL ??
          "postgresql://postgres:postgres@localhost:5432/payments",
        PAYMENTS_GRPC_URL: process.env.PAYMENTS_GRPC_URL ?? "localhost:50051",
      },
    },
    {
      name: "restaurante-menu",
      cwd: root,
      script: pnpm,
      args: ["--filter", "@restaurante/menu", "dev"],
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: "5s",
      out_file: resolve(root, "logs/pm2/menu-out.log"),
      error_file: resolve(root, "logs/pm2/menu-error.log"),
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "development",
        PORT: "3002",
        MENU_DATABASE_URL:
          process.env.MENU_DATABASE_URL ??
          "postgresql://postgres:postgres@localhost:5432/menu",
        MENU_GRPC_URL: process.env.MENU_GRPC_URL ?? "localhost:50052",
      },
    },
    {
      name: "restaurante-salon",
      cwd: root,
      script: pnpm,
      args: ["--filter", "@restaurante/salon", "dev"],
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: "5s",
      out_file: resolve(root, "logs/pm2/salon-out.log"),
      error_file: resolve(root, "logs/pm2/salon-error.log"),
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "development",
        PORT: "3003",
        SALON_DATABASE_URL:
          process.env.SALON_DATABASE_URL ??
          "postgresql://postgres:postgres@localhost:5432/salon",
        SALON_GRPC_URL: process.env.SALON_GRPC_URL ?? "localhost:50053",
        ORDERS_GRPC_URL: process.env.ORDERS_GRPC_URL ?? "localhost:50054",
      },
    },
    {
      name: "restaurante-gateway",
      cwd: root,
      script: pnpm,
      args: ["--filter", "@restaurante/gateway", "dev"],
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: "5s",
      out_file: resolve(root, "logs/pm2/gateway-out.log"),
      error_file: resolve(root, "logs/pm2/gateway-error.log"),
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "development",
        PORT: "3000",
        GATEWAY_API_URL: process.env.GATEWAY_API_URL ?? "http://localhost:3001",
        GATEWAY_SALON_URL: process.env.GATEWAY_SALON_URL ?? "http://localhost:3003",
        GATEWAY_MENU_URL: process.env.GATEWAY_MENU_URL ?? "http://localhost:3002",
      },
    },
    {
      name: "restaurante-web",
      cwd: resolve(root, "apps/web"),
      script: process.execPath,
      args: [
        resolve(root, "scripts/pm2-portless-run.mjs"),
        "restaurante",
        resolve(root, "scripts/run-web-dev.mjs"),
      ],
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
        NEXT_PUBLIC_API_URL:
          process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
      },
    },
  ],
};

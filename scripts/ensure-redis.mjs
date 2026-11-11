#!/usr/bin/env node
/**
 * Asegura Redis en 127.0.0.1:6379.
 * Si ya responde PING, no hace nada. Si no, arranca el contenedor restaurante-redis.
 */
import { spawnSync } from "node:child_process";
import net from "node:net";

function ping() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: 6379 });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 400);
    socket.on("connect", () => {
      socket.write("*1\r\n$4\r\nPING\r\n");
    });
    socket.on("data", (buf) => {
      clearTimeout(timer);
      socket.end();
      resolve(buf.toString("utf8").includes("PONG"));
    });
    socket.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function run(bin, args) {
  return spawnSync(bin, args, { encoding: "utf8" });
}

if (await ping()) {
  console.log("Redis ya responde en 127.0.0.1:6379.");
  process.exit(0);
}

const engine = ["docker", "podman"].find((bin) => run(bin, ["--version"]).status === 0);
if (!engine) {
  console.error("Redis no responde en 127.0.0.1:6379 y no hay docker ni podman.");
  process.exit(1);
}

const started = run(engine, ["start", "restaurante-redis"]);
if (started.status !== 0) {
  const created = run(engine, [
    "run",
    "-d",
    "--name",
    "restaurante-redis",
    "-p",
    "6379:6379",
    "docker.io/library/redis:7-alpine",
  ]);
  if (created.status !== 0) {
    console.error(created.stderr || created.stdout || `No pude crear restaurante-redis con ${engine}.`);
    process.exit(created.status ?? 1);
  }
}

for (let attempt = 0; attempt < 20; attempt += 1) {
  if (await ping()) {
    console.log("Redis encendido (restaurante-redis).");
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

console.error("Redis no contestó PING en 127.0.0.1:6379.");
process.exit(1);

#!/usr/bin/env node
/**
 * Enciende el Postgres local (systemd) si está apagado.
 * No lo apaga: es un servicio del sistema, no un proceso de la app.
 */
import { spawnSync } from "node:child_process";

function systemctl(args, inherit = false) {
  return spawnSync("systemctl", args, inherit ? { stdio: "inherit" } : { encoding: "utf8" });
}

const listed = systemctl(["list-unit-files", "postgresql*.service", "--no-legend", "--no-pager"]);
if (listed.error) {
  console.error("systemctl no está disponible. Postgres tiene que arrancar como servicio del sistema.");
  process.exit(1);
}

const units = listed.stdout
  .split("\n")
  .map((line) => line.trim().split(/\s+/))
  .filter((parts) => parts[0]?.endsWith(".service"))
  .map(([name, state]) => ({ name, state }));

if (units.length === 0) {
  console.error("No hay un servicio PostgreSQL (postgresql*.service).");
  console.error("Instálalo y usa la URL de apps/api/.env.example.");
  process.exit(1);
}

const chosen = (units.find((unit) => unit.state === "enabled") ?? units[0]).name;
const active = systemctl(["is-active", "--quiet", chosen]);

if (active.status === 0) {
  console.log(`Postgres (${chosen}) ya está encendido.`);
  process.exit(0);
}

console.log(`Encendiendo ${chosen}...`);
const start = systemctl(["start", chosen], true);
if (start.status !== 0) {
  console.error(`No pude encender ${chosen}.`);
  console.error(`Prueba: sudo systemctl start ${chosen}`);
  process.exit(start.status ?? 1);
}

if (systemctl(["is-active", "--quiet", chosen]).status !== 0) {
  console.error(`${chosen} no quedó activo.`);
  process.exit(1);
}

console.log(`Postgres (${chosen}) encendido.`);

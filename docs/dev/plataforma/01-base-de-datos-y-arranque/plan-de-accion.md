# Plan de acción — Tarea 1 · Base de datos y arranque (E0)

**Rama:** `dev/plataforma`  
**Tarea:** 1 de 4 del Sprint 1. Solo esta.  
**Fecha:** 30 de septiembre de 2026  
**Estado:** plan para acuerdo. No autoriza por sí solo a editar código.  
**Análisis:** `analisis.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Resultado

Con Postgres en la URL de `apps/api/.env.example`:

1. `pnpm dev` levanta API y web sin error.
2. Existen las tablas del menú, creadas por una migración de Drizzle Kit.
3. `GET http://localhost:3001/health` responde el mismo contrato de hoy.
4. `GET http://localhost:3001/health/database` responde que la base contestó.
5. Si no hay `DATABASE_URL` o Postgres no acepta la conexión, la API no se queda escuchando.
6. `http://localhost:3000/` sigue abriendo.

Los casos de uso del menú no forman parte del código de esta tarea. El esquema sí queda capaz de guardarlos. Las pruebas de abajo separan las dos cosas.

## 2. No entra en los archivos de esta tarea

- `MenuItem`, `Modifier`, `Money`, `TaxRate`.
- `CreateMenuItem`, `ListMenuItems`, `UpdateMenuItem`, `DeactivateMenuItem`.
- `MenuRepository` y `DrizzleMenuRepository`.
- Controller, Zod o ruta `/menu-items`.
- Cualquier archivo nuevo bajo `apps/web` salvo que el arranque esté roto por esta tarea.
- Tablas de órdenes, cocina, totales o pagos.
- SQL escrito a mano, `_journal.json` editado a mano, `ALTER` suelto.

## 3. Decisiones

| Decisión | Detalle |
|----------|---------|
| Driver | `postgres` (postgres.js) + `drizzle-orm`. En dev: `drizzle-kit` |
| URL | `DATABASE_URL` del `.env.example`. No se inventa otra base para “salir del paso” |
| Carga de entorno | La API lee `apps/api/.env` al arrancar, en el composition root. PM2 también pasa `DATABASE_URL` al proceso de la API |
| Servicio Postgres | `pnpm dev`, `pnpm dev:restart` y `pnpm dev:plain` encienden el servicio systemd (`postgresql-18` en esta máquina) si está apagado. `pnpm dev:stop` no lo apaga |
| Fallo de conexión | El proceso sale antes de `listen` |
| Health de proceso | `GET /health` no cambia |
| Health de base | `GET /health/database` usa el caso `CheckDatabaseConnection` |
| Ids | `text`, los generará la aplicación en la tarea 2. Sin default de UUID en esta migración |
| Dinero | `price_amount` entero (centavos). `price_currency` `text`. MVP `MXN` |
| Impuesto de catálogo | `tax_basis_points` entero. `1600` = 16 %. No es el total de una orden |
| Baja | Columna `active`, no borrado |
| Integridad extra / exclusión | Check en Postgres, además de la regla que escribirá el dominio en la tarea 2 |
| Tests sin base | Vitest en `apps/api` para el caso de uso con puerto falso |
| Tests con base | Smoke contra el Postgres local. Si no hay servidor, se para y se reporta |

## 4. Esquema

Dos tablas. Nombres internos. No se exponen en JSON.

### `menu_items`

| Columna | Tipo | Restricción |
|---------|------|-------------|
| `id` | `text` | PK |
| `name` | `text` | `not null`, longitud > 0 tras `btrim` |
| `price_amount` | `integer` | `not null`, `>= 0` |
| `price_currency` | `text` | `not null`, longitud 3 |
| `tax_basis_points` | `integer` | `not null`, `>= 0` |
| `active` | `boolean` | `not null`, default `true` |

### `menu_item_modifiers`

| Columna | Tipo | Restricción |
|---------|------|-------------|
| `id` | `text` | PK |
| `menu_item_id` | `text` | `not null`, FK a `menu_items.id`, `on delete cascade` |
| `name` | `text` | `not null`, longitud > 0 tras `btrim` |
| `kind` | `text` | `not null`, solo `extra` o `exclusion` |
| `price_amount` | `integer` | Ver check |
| `price_currency` | `text` | Ver check |

Check de la hija:

- `kind = 'extra'` implica `price_amount >= 0` y `price_currency` no nulo.
- `kind = 'exclusion'` implica `price_amount` nulo y `price_currency` nulo.

Sin índice extra más allá de la PK y la FK. El listado del sprint cabe en un scan.

## 5. Mapa de casos de uso → base

Estos casos no se programan aquí. Cada fila dice qué prueba de esquema los deja cubiertos.

| Caso (tarea 2) | Qué debe poder hacer la base | Prueba de esta tarea |
|----------------|------------------------------|----------------------|
| `CreateMenuItem` | Insertar plato activo, extra con precio y exclusión sin precio, en una transacción | Prueba D3 |
| `CreateMenuItem` inválido | Rechazar nombre vacío, precio negativo, tasa negativa, extra sin precio, exclusión con precio | Pruebas D4 y D5 |
| `ListMenuItems` | Leer activos e inactivos, con sus hijas | Prueba D6 |
| `UpdateMenuItem` | Reemplazar campos del mismo `id` y reescribir hijas | Prueba D7 |
| `DeactivateMenuItem` | Pasar `active` a falso sin borrar fila ni hijas | Prueba D8 |
| Reinicio | La fila sigue después de cerrar el cliente | Prueba D9 |

| Caso de esta tarea | Prueba |
|--------------------|--------|
| `CheckDatabaseConnection` con puerto ok | Prueba U1 |
| `CheckDatabaseConnection` con puerto que falla | Prueba U2 |
| Arranque con base real | Prueba S1 |
| Arranque sin base | Prueba S2 |
| Web sigue viva | Prueba S3 |

## 6. Capas

- **Dominio:** sin archivos nuevos.
- **Aplicación:** `DatabaseHealthPort` y `CheckDatabaseConnection`. El caso recibe el puerto por constructor. Si `ping` resuelve, el resultado es `{ status: "ok" }`. Si rechaza, el caso lanza un error de aplicación propio, sin código HTTP ni mensaje de driver.
- **Adaptador:** cliente Drizzle, esquema de la sección 4, `DrizzleDatabaseHealth` que ejecuta `select 1`.
- **HTTP:** el controller de database health llama al caso. 200 si ok. 503 si el caso lanza el error de conexión. El cuerpo es `{ status: "ok" | "unavailable", service: "restaurante-api" }`. Sin cadena de Postgres.
- **Composition root:** carga `.env`, exige `DATABASE_URL`, construye el cliente, hace ping, y solo entonces escucha. El módulo registra el adaptador como implementación del puerto.

## 7. Orden de implementación

### Paso 1 — Tests del caso de uso

Archivos:

- `apps/api/src/application/ports/database-health.port.ts`
- `apps/api/src/application/database/check-database-connection.ts`
- `apps/api/src/application/database/database-connection.error.ts`
- `apps/api/src/application/database/check-database-connection.spec.ts`
- Vitest en `apps/api` y script `test`

El falso del puerto vive en el spec. No abre sockets.

Listo cuando U1 y U2 pasan sin `DATABASE_URL`.

### Paso 2 — Cliente, esquema y migración

Dependencias de `apps/api`: `drizzle-orm`, `postgres`. Dev: `drizzle-kit`.

Archivos:

- `apps/api/drizzle.config.ts` — lee `DATABASE_URL`, apunta al esquema
- `apps/api/src/infrastructure/persistence/drizzle/client.ts` — recibe la URL por argumento
- `apps/api/src/infrastructure/persistence/drizzle/schema/menu.ts` — las dos tablas y los checks
- `apps/api/src/infrastructure/persistence/drizzle/drizzle-database-health.ts` — implementa el puerto
- Scripts `db:generate` y `db:migrate` en `apps/api/package.json`

Comandos, en este orden, con Postgres ya creado como `restaurante` y la URL del ejemplo:

1. `pnpm --filter @restaurante/api db:generate`
2. `pnpm --filter @restaurante/api db:migrate`
3. Comprobar en la base que existen `menu_items` y `menu_item_modifiers`

Si no hay Postgres, parar. No se escribe la migración a mano.

### Paso 3 — Arranque y health

Archivos:

- `apps/api/src/main.ts` — carga el `.env` de la API, ping, luego `listen`
- `apps/api/src/app.module.ts` — cablea puerto → adaptador y el controller nuevo
- `apps/api/src/interface/http/controllers/database-health.controller.ts`
- `ecosystem.config.cjs` — `env.DATABASE_URL` del proceso `restaurante-api`, mismo valor que el `.env.example` salvo que el entorno ya traiga otra URL

`GET /health` no se reescribe.

### Paso 4 — Pruebas con base y smoke de procesos

Ejecutar la sección 8. Después, `pnpm dev:restart` y la sección 9.

## 8. Catálogo de pruebas

### Sin Postgres

**U1.** Puerto falso que resuelve. `CheckDatabaseConnection` devuelve `{ status: "ok" }`. No hay import de `drizzle-orm`, `postgres` ni `@nestjs/*` en el caso de uso ni en el spec.

**U2.** Puerto falso que rechaza. El caso lanza `DatabaseConnectionError`. El spec no mira el mensaje del driver.

### Con Postgres, después de migrar

Se pueden hacer con un script de smoke en `scripts/` o con SQL puntual contra la base de desarrollo. No son tests de dominio. Cada una se anota como pasada o fallida al cerrar la tarea.

**D1.** `DATABASE_URL` conecta. `select 1` devuelve 1.

**D2.** Existen `menu_items` y `menu_item_modifiers` con las columnas de la sección 4.

**D3.** En una transacción: insertar plato `price_amount = 4500`, `price_currency = 'MXN'`, `tax_basis_points = 1600`, `active = true`; hija `extra` con `price_amount = 1500`; hija `exclusion` con precios nulos. `commit`. Un `select` devuelve las tres cosas.

**D4.** La base rechaza: nombre vacío o solo espacios, `price_amount` negativo, `tax_basis_points` negativo, `kind` distinto de `extra` y `exclusion`.

**D5.** La base rechaza un `extra` con `price_amount` nulo y una `exclusion` con `price_amount` no nulo.

**D6.** Insertar un plato `active = false` con una hija. Un `select` sin filtro de `active` lo devuelve junto con el activo de D3.

**D7.** Actualizar el nombre y el precio del plato de D3. Borrar sus hijas (la FK en cascada vale si se borra el plato; para reescribir hijas, `delete` por `menu_item_id` e insert nuevo). El `id` del plato no cambia. Queda la hija nueva y no las viejas.

**D8.** Poner `active = false` en el plato de D3. La fila y la hija de D7 siguen ahí. No se usa `DELETE` del plato.

**D9.** Cerrar el cliente, abrir otro con la misma URL, leer el plato de D8. Mismos id, nombre, centavos, tasa, `active = false` y la hija.

### Arranque

**S1.** Con la URL válida, la API escucha 3001. `GET /health` es `{ "status": "ok", "service": "restaurante-api" }`. `GET /health/database` es `{ "status": "ok", "service": "restaurante-api" }`.

**S2.** Parar Postgres o poner una URL imposible y arrancar la API. El proceso termina con error. `GET /health` no responde en 3001. No se acepta un log de error con el puerto todavía abierto.

**S3.** `GET http://localhost:3000/` responde la home actual.

**S4.** `pnpm --filter @restaurante/api typecheck` pasa. En `apps/api/src/domain` no hay imports nuevos.

## 9. Smoke de demo de esta tarea

1. `pnpm dev:restart`.
2. S1, S3 y D2.
3. D3 a D9.
4. Restaurar Postgres si se cortó para S2, y repetir S1 para dejar el entorno usable.

## 10. Hecho cuando

- [x] U1 y U2 pasan sin base
- [x] Migración generada por Drizzle Kit y aplicada
- [x] D1–D9 anotadas
- [x] S1–S4 anotadas
- [x] `GET /health` intacto
- [x] Sin casos de uso de menú, sin endpoints de menú, sin pantalla nueva
- [x] El módulo Nest es quien elige el adaptador de ping

## 11. Cierre — 30 de septiembre de 2026

Migrate: `pnpm --filter @restaurante/api db:migrate` (generada antes: `apps/api/drizzle/0000_abnormal_jigsaw.sql`).

Las filas de prueba (`smoke-*`) se borraron después de D9. La base queda sin platos.

| Prueba | Resultado |
|--------|-----------|
| U1 | Pasó (sin `DATABASE_URL`) |
| U2 | Pasó (sin `DATABASE_URL`) |
| D1 | Pasó |
| D2 | Pasó |
| D3 | Pasó |
| D4 | Pasó |
| D5 | Pasó |
| D6 | Pasó |
| D7 | Pasó |
| D8 | Pasó |
| D9 | Pasó |
| S1 | Pasó |
| S2 | Pasó (URL imposible, el proceso salió y el 3001 no escuchó) |
| S3 | Pasó |
| S4 | Pasó |

Tras `pnpm dev:restart`, S1, S3, D2 y D3–D9 se repitieron y pasaron. Postgres no se detuvo en S2; el entorno quedó con la API y la web respondiendo.

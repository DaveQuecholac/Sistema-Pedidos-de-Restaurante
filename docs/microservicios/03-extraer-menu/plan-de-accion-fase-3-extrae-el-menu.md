# Plan de acción — Fase 3 · Extraer el menú

**Fecha:** 28 de octubre de 2026  
**Análisis de la fase:** `analisis.md` en esta carpeta.  
**Corte:** `../analisis.md`, secciones 3, 5 y 6. **Plan general:** `../plan-de-accion-general-corte-a-microservicios.md`.  
**Estado:** cerrado en código el 28 de octubre de 2026. Migraciones `apps/menu/drizzle/0000_absurd_solo.sql` y `apps/api/drizzle/0014_real_infant_terrible.sql`. La corrida está en `docs/desarrollo/pruebas-cttm.md`. La fase 2 sigue en `0012_late_tarantula.sql`, `0013_milky_magma.sql` y `0000_military_mac_gargan.sql`.  
**Ya en código:** fase 1 (`0011_talented_scorpion.sql`, `menu_item_id` sin clave foránea) y fase 2 (Pagos en gRPC, base `payments`, `payment.proto`).

Al cerrar, el admin de platos habla con Menú por REST y la comanda sigue en la API. Agregar una línea pide el precio vigente por gRPC y lo congela. Cocina, totales y cobro no cambian de URL.

---

## 1. Resultado

`apps/menu` posee el CRUD y la base `menu`. La API ya no tiene esas tablas ni `MenuItemController`. `AddLine` y `ModifyLine` leen por `MenuCatalog`. La web de platos usa `NEXT_PUBLIC_MENU_API_URL`. El resto de la web sigue en `NEXT_PUBLIC_API_URL`.

**Señal:** con Menú apagado no se agrega una línea, y una orden que ya tenía líneas se puede cobrar. Con Menú encendido, cambiar el precio del plato no cambia el precio de la línea ya guardada.

## 2. Archivos

### Se crean

| Archivo | Rol |
|---------|-----|
| `packages/contracts/menu.proto` | `GetMenuItem`. Mismo paquete `@restaurante/contracts` que ya existe por Pagos |
| `apps/menu/` | Hexágono del catálogo: dominio de plato, casos de alta, lista, cambio y baja, Drizzle, REST y gRPC |
| `apps/menu/drizzle/0000_*.sql` | Tablas del menú en la base `menu`, solo vía `db:generate` de ese paquete |
| `scripts/dev/copy-menu-out-of-orders.mjs` | Una sola vez: copia las tres tablas a la base `menu`. No vive junto a un caso de uso |
| `apps/api/drizzle/0014_*.sql` | Quita las tres tablas de la base de la API. Solo `db:generate` |
| `apps/api/src/application/ports/menu-catalog.ts` | `findById(id): Promise<MenuItemSnapshot \| null>` |
| `apps/api/src/infrastructure/menu/grpc-menu-catalog.ts` | Adaptador de ese puerto |

El sufijo de `0014` y del `0000` de Menú lo pone Drizzle Kit.

### Se mudan a `apps/menu`

Salen de `apps/api` y dejan de importarse desde ahí:

- `domain/menu/**` (plato, ingrediente, modificador, tasa, errores y sus specs de reglas de alta).
- `application/menu/**` (`CreateMenuItem`, `UpdateMenuItem`, `DeactivateMenuItem`, `ListMenuItems`).
- `infrastructure/persistence/drizzle/schema/menu.ts` y `drizzle-menu-repository.ts` con su spec de integración.
- `interface/http/menu/**` (controller, presenter, Zod, errores HTTP y el spec del controller).

`Money` se copia dentro de `apps/menu`, como ya se copió en Pagos. Menú no importa el `Money` de la API ni el de Pagos.

### Se tocan

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/domain/order/line-item.ts` | `capture` y `recapture` aceptan el snapshot, no la clase `MenuItem`. Siguen rechazando inactivo y modificador desconocido |
| `apps/api/src/application/order/add-line.ts` y `modify-line.ts` | Dependen de `MenuCatalog` |
| Sus specs, y los de `line-item` | El doble es el catálogo, no `MenuRepository` |
| `apps/api/src/app.module.ts` | Salen el controller de menú y `DrizzleMenuRepository`. Entra el cliente gRPC. `MENU_GRPC_URL` solo en el arranque |
| `apps/api/src/infrastructure/persistence/drizzle/schema/order.ts` | Nada en columnas. El schema de la API deja de exportar las tablas de menú |
| `apps/api/drizzle.config.ts` | Deja de listar `schema/menu.ts` |
| `ecosystem.config.cjs` | Proceso `restaurante-menu` |
| `apps/web/app/menu/menu-api.ts` y `menu-api.spec.ts` | Base URL de platos. El resto de `*-api.ts` no cambia |

### No se tocan

- `apps/payments/**`, `payment.proto`, la saga de cobro, `order_lines.menu_item_id`.
- Mesas, sittings, totales, cocina.
- Gateway. No se crea `apps/gateway`.
- `NEXT_PUBLIC_API_URL` de órdenes, mesas, cuenta y cobro.

Si hace falta un archivo fuera de esta lista, se anota en el chat y se acuerda antes de seguir.

## 3. Capas

| Dónde | Qué |
|-------|-----|
| Dominio de la orden | `LineItem` congela el snapshot. No aprende HTTP ni gRPC. Las reglas de cocina no se mueven |
| Dominio del plato | Vive en Menú: alta, cambio, baja, ingrediente y modificador. La API ya no lo administra |
| Application de la API | Puerto `MenuCatalog`. `AddLine` y `ModifyLine` lo usan. `MenuRepository` de escritura no se queda en la API |
| Application de Menú | Los cuatro casos de uso actuales, con su `MenuRepository` |
| Adaptadores | Menú: Drizzle y REST de siempre, más el servidor gRPC de lectura. API: cliente gRPC. La web: otra base URL solo en el cliente de platos |
| Composition root | Cada proceso elige su adaptador. `process.env` solo al arrancar |

## 4. Contrato

### 4.1 La web no pasa por un gateway

Menú escucha REST en `http://localhost:3002`. gRPC en `localhost:50052`. Pagos sigue en `50051`. La API sigue en `3001`.

`menu-api.ts` lee `NEXT_PUBLIC_MENU_API_URL`. Si falta, el error sigue siendo de configuración, ahora nombrando esa variable. `GET/POST /menu-items`, `PATCH /menu-items/:id` y `POST /menu-items/:id/deactivate` conservan el JSON de `presentMenuItem`. Los specs de menú de la web esperan `http://localhost:3002`. Los de órdenes, mesas, cuenta y cobro siguen en `http://localhost:3001`.

### 4.2 Protobuf

Se carga con `@grpc/proto-loader`, como `payment.proto`. No se agrega `protoc`.

```protobuf
syntax = "proto3";
package restaurante.menu.v1;

service MenuCatalogService {
  rpc GetMenuItem(GetMenuItemRequest) returns (MenuItemSnapshot);
}

message GetMenuItemRequest {
  string id = 1;
}

message MoneySnapshot {
  int32 amount = 1;
  string currency = 2;
}

message IngredientSnapshot {
  string id = 1;
  string name = 2;
}

message ModifierSnapshot {
  string id = 1;
  string name = 2;
  string kind = 3;
  MoneySnapshot price = 4;
}

message MenuItemSnapshot {
  string id = 1;
  string name = 2;
  MoneySnapshot price = 3;
  int32 tax_basis_points = 4;
  bool active = 5;
  repeated IngredientSnapshot ingredients = 6;
  repeated ModifierSnapshot modifiers = 7;
}
```

En un extra, `kind` es `extra` y `price` viene lleno. En una exclusión, `kind` es `exclusion` y `price` no se manda. Un id que no existe es `NOT_FOUND`. El adaptador de la API lo vuelve `null`, y `AddLine` sigue lanzando `MenuItemNotFoundError`. Si el proceso no responde, el adaptador lanza `MenuCatalogUnavailableError` (error de aplicación, mensaje fijo). No se inserta la línea.

`GetMenuItem` es solo lectura. Crear, editar y desactivar no tienen RPC. Eso es REST de Menú.

### 4.3 Snapshot que congela la línea

El tipo del puerto, en la API, trae id, nombre, precio, tasa, `active`, ingredientes y modificadores. `LineItem.capture` / `recapture`:

- plato inactivo → `MenuItemUnavailableError`, no guarda;
- `modifierId` que no está en el snapshot → `UnknownModifierError`;
- si pasa, la línea guarda id del plato, nombre, precio unitario, tasa y los modificadores elegidos con su precio de ese momento.

Esas tres reglas ya están en `buildFromMenu`. Cambian de entrada, no de resultado.

### 4.4 Bases

`CREATE DATABASE menu` en el mismo Postgres. El `0000` de Menú crea `menu_items`, `menu_item_ingredients` y `menu_item_modifiers` con los checks que hoy tiene `schema/menu.ts` (nombre no vacío, precio `>= 0`, moneda de 3, tasa `>= 0`, `kind` extra o exclusión, y la forma del precio según el kind). Si el SQL trae tablas de órdenes o de pagos, se corrige el schema, `drizzle-kit drop` y se regenera. No se edita el `.sql`.

Después de migrar esa base, `scripts/dev/copy-menu-out-of-orders.mjs` copia las tres tablas desde la base de la API. Se puede correr dos veces sin duplicar ids. Si no hay filas, termina en cero.

Luego el schema de la API deja de declarar esas tablas. `db:generate` de la API (0014) solo hace `DROP TABLE` de las tres, en orden de hijas primero. No toca `order_lines` ni `menu_item_id`. Si trae otro `DROP` o un `ADD COLUMN`, se tira esa migración con `drizzle-kit drop` y se regenera. Si `db:migrate` falla, se para.

## 5. Pruebas

### En Menú

Con `MENU_REPOSITORY_INTEGRATION=1` y `MENU_DATABASE_URL`. Si no están, el bloque se salta.

| Id | Qué demuestra |
|----|----------------|
| M3-1 | Alta, lista, cambio de precio y desactivar. El id no cambia al editar. Desactivar deja `active = false` y no borra la fila |
| M3-2 | `GetMenuItem` del plato de M3-1 devuelve nombre, precio, tasa, ingredientes y un extra con precio. Un id desconocido es `NOT_FOUND` |
| M3-3 | La base rechaza nombre vacío, precio negativo, tasa negativa, `kind` inválido, extra sin precio y exclusión con precio |

M3-1 entra por los casos de uso y el repositorio Drizzle. M3-2 entra por el servidor gRPC contra esa base. M3-3 es la restricción. Los specs de dominio del plato y el spec HTTP se corren dentro de `apps/menu` (`pnpm --filter @restaurante/menu test` y typecheck). El JSON del controller sigue siendo el de `presentMenuItem`.

### En la API, sin Postgres y sin Menú

```bash
env -u DATABASE_URL pnpm --filter @restaurante/api test
pnpm --filter @restaurante/api typecheck
```

| Id | Qué demuestra |
|----|----------------|
| M3-4 | `AddLine` con un catálogo de prueba congela precio `4500` y tasa `1600`. Un id ausente es `MenuItemNotFoundError` y no guarda. Un plato inactivo es `MenuItemUnavailableError` |
| M3-5 | `ModifyLine` relee el catálogo y vuelve a congelar. No usa el precio viejo de la línea si el snapshot trae otro |
| M3-6 | El adaptador gRPC, con un doble del cliente: snapshot → puerto; `NOT_FOUND` → `null`; canal caído → `MenuCatalogUnavailableError` |

`close-order.spec.ts` y los de cocina siguen verdes. No levantan Menú: la orden de prueba ya trae la línea.

### Cruce de proceso

`MENU_GRPC_INTEGRATION=1`, Menú en 3002 y 50052, las dos bases migradas. Pagos en 50051 solo para el cobro de M3-8.

| Id | Qué demuestra |
|----|----------------|
| M3-7 | Alta por REST en 3002. `POST /orders/:id/lines` en 3001 congela ese precio. Luego `PATCH` del plato a otro precio. `GET` de la orden sigue con el precio capturado. Una línea nueva del mismo plato lleva el precio nuevo |
| M3-8 | Con la orden de M3-7 ya en `READY`, se apaga Menú. `POST .../lines` falla y no agrega línea. `POST .../close` con efectivo cobra. La fila del pago queda en `payments`, como en la fase 2 |

### Regresión

`pnpm --filter @restaurante/api test:db` sigue verde. Ya no incluye el spec de menú (se fue con el paquete). F1–F3 de la fase 1 siguen. `pnpm --filter @restaurante/web test` incluye el cambio de URL de platos y nada más. `apps/payments` no se modifica; su test no es compuerta de esta fase. Si falla, se para para confirmar que no se editó Pagos.

## 6. Demo de piso

Hace falta Menú en `http://localhost:3002`, la API en `3001` y Pagos en gRPC `localhost:50051`.

1. `POST http://localhost:3002/menu-items` con precio `{ "amount": 1000, "currency": "MXN" }`, impuesto `{ "basisPoints": 0 }`, un ingrediente y `modifiers: []`.
2. `POST http://localhost:3001/orders` con un `externalOrderId` único.
3. `POST http://localhost:3001/orders/:orderId/lines` con ese `menuItemId`, cantidad 1 y `modifierIds: []`.
4. `PATCH http://localhost:3002/menu-items/:id` sube el precio a 2500. `GET` de la orden en 3001 sigue mostrando 1000 en esa línea.
5. Cocina: `send-to-kitchen`, `begin-cooking`, `mark-ready`.
6. `GET /orders/:orderId/totals` y `POST /orders/:orderId/close` con efectivo por ese total. Queda `CLOSED`.
7. Se apaga `restaurante-menu`. Otra orden abierta: `POST .../lines` del mismo plato no agrega línea. La orden cerrada en el paso 6 sigue en `CLOSED` y `GET .../payment` responde.
8. En la base `menu` está el plato. En la base de la API no están `menu_items` ni sus hijas. `order_lines.menu_item_id` de la línea del paso 3 es el id del paso 1.

Sin la base `menu` o sin el proceso, la fase no se marca cerrada. El admin en el navegador usa la pantalla de menú contra 3002: listar y desactivar el plato del paso 1. Órdenes y cobro se abren como hoy, contra la API.

## 7. Fuera

- `apps/gateway`, cambiar `NEXT_PUBLIC_API_URL`, mover mesas.
- RPC de alta o de baja. El admin es REST.
- Reescribir cocina, totales o la saga de cobro.
- Volver a poner la FK de `order_lines` hacia `menu_items`.
- Paquete compartido con la clase `MenuItem` o con `Order`.
- El plan de la fase 4. Se pide cuando esta fase esté cerrada en código.

## 8. Pasos

1. Leer el análisis de esta carpeta y las secciones 3, 5 y 6 de `../analisis.md`. No abrir la fase 4.
2. Agregar `menu.proto` como en la sección 4.2.
3. Crear `apps/menu` con el hexágono mudado, su `Money`, el schema y el servidor gRPC de `GetMenuItem`. REST en el puerto 3002. `db:generate` y revisar el `0000`. `CREATE DATABASE menu` si no existe. `db:migrate` de Menú.
4. Dejar verdes M3-1, M3-2 y M3-3, y el typecheck de `@restaurante/menu`.
5. Correr `scripts/dev/copy-menu-out-of-orders.mjs`. Cada id de la base vieja tiene pareja en `menu`.
6. Quitar las tres tablas del schema de la API y la entrada en `drizzle.config.ts`. `db:generate` → el SQL es solo los `DROP TABLE` de la sección 4.4 → `db:migrate`. Eso es 0014.
7. Puerto `MenuCatalog`, cambio de `LineItem.capture` / `recapture`, y `AddLine` / `ModifyLine`. Adaptador gRPC. El módulo de la API ya no registra el controller ni el repositorio de menú.
8. `restaurante-menu` en `ecosystem.config.cjs`. `MENU_GRPC_URL` solo en el arranque de la API. `NEXT_PUBLIC_MENU_API_URL` en la web, solo para `menu-api.ts`. `pnpm dev:restart`.
9. Correr la regresión de la sección 5, M3-7 y M3-8, y la demo de la sección 6.
10. Anotar la corrida en `docs/desarrollo/pruebas-cttm.md`, con el nombre real del `0000` de Menú y del `0014`. No borrar las corridas de las fases 1 y 2.
11. En el plan general, marcar la fase 3 como cerrada en código. Marcar este archivo como cerrado, con la fecha y esas migraciones.

Si el paso 3 o el 6 falla, no se sigue. No se escribe SQL a mano.

## 9. Siguiente paso

Cerrado. El siguiente paso es escribir el plan de la fase 4 cuando se pida. No se escribe en este turno.

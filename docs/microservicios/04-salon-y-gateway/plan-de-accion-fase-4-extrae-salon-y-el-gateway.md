# Plan de acción — Fase 4 · Extraer el salón y poner el gateway

**Fecha:** 28 de octubre de 2026  
**Análisis de la fase:** `analisis.md` en esta carpeta.  
**Corte:** `../analisis.md`, secciones 3, 5, 6 y 9. **Plan general:** `../plan-de-accion-general-corte-a-microservicios.md`.  
**Estado:** cerrado en código el 28 de octubre de 2026. Migraciones `apps/salon/drizzle/0000_naive_white_queen.sql` y `apps/api/drizzle/0015_eminent_earthquake.sql`. La corrida está en `docs/desarrollo/pruebas-cttm.md`. La fase 3 sigue en `0000_absurd_solo.sql` y `0014_real_infant_terrible.sql`.  
**Ya en código:** fases 1 a 3. Fase 1 `0011_talented_scorpion.sql`. Fase 2 Pagos en gRPC, base `payments`, `payment.proto`. Fase 3 Menú en REST `3002` y gRPC `50052`, base `menu`, `menu.proto`.

Esta fase tiene dos bloques en el mismo plan. Primero Salón y los dos gRPC. Después el gateway y una sola URL en la web. No nace una fase 6.

Al cerrar, el flujo de mesa (abrir, línea, cocina, totales, cobro) entra por `http://localhost:3000`.

---

## 1. Resultado

`apps/salon` posee el catálogo de mesas y la base `salon`. La API conserva órdenes, cocina, totales, cuenta de mesa y el cliente de Pagos y de Menú. `OpenOrder` de mesa usa `TableCatalog`. `DeactivateTable` usa `ActiveOrdersQuery`. `apps/gateway` reenvía REST. La web solo conoce el `3000`.

**Señal:** crear mesa, abrir orden, agregar línea, cocina, totales y cobro pasan por el gateway. Desactivar esa mesa mientras la orden sigue activa se rechaza. Pagos no tiene ruta en el gateway.

## 2. Archivos

### Se crean

| Archivo | Rol |
|---------|-----|
| `packages/contracts/salon.proto` | `GetTable` |
| `packages/contracts/orders.proto` | `HasActiveOrder` |
| `apps/salon/` | Hexágono del plano: dominio de mesa, casos de alta, lista, cambio, activar y desactivar, Drizzle, REST y gRPC |
| `apps/salon/drizzle/0000_*.sql` | Tabla `tables` en la base `salon`, solo vía `db:generate` |
| `scripts/dev/copy-tables-out-of-orders.mjs` | Una sola vez: copia `tables` a la base `salon` |
| `apps/api/drizzle/0015_*.sql` | Quita `tables` de la base de la API. Solo `db:generate` |
| `apps/api/src/application/ports/table-catalog.ts` | `findById` para `OpenOrder` |
| `apps/api/src/infrastructure/table/grpc-table-catalog.ts` | Cliente de Salón |
| `apps/api/src/interface/grpc/active-orders-grpc-server.ts` | Servidor `HasActiveOrder` en la API |
| `apps/gateway/` | Reenvío HTTP. Sin dominio y sin base |

El sufijo de `0015` y del `0000` de Salón lo pone Drizzle Kit.

### Se mudan a `apps/salon`

Salen de `apps/api` y dejan de importarse desde ahí:

- `domain/table/table.ts` y sus errores (el plano). No se mueve `domain/table/table-sitting.ts` ni la cuenta.
- `application/table` de catálogo: crear, listar, obtener, actualizar, activar, desactivar, y el repositorio en memoria del plano.
- `infrastructure/persistence/drizzle/schema/table.ts`, `drizzle-table-repository.ts` y su spec.
- `interface/http/table/table.controller.ts`, presenter, schema y errores de ese controller.

`DeactivateTable` se muda y deja de recibir `OrderRepository`. Recibe `ActiveOrdersQuery`.

Se queda en la API: `table-account.controller.ts`, casos de cuenta, `table_sittings`, `CloseTableAccount`, `OpenOrder`, órdenes y cocina.

### Se tocan

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/application/order/open-order.ts` | Mesa: `TableCatalog` en lugar de `TableRepository`. Id externo: no llama a Salón |
| `apps/api/src/main.ts` | Sigue el HTTP en `3001` y abre gRPC en `50054` |
| `ecosystem.config.cjs` | `restaurante-salon` y `restaurante-gateway` |
| `apps/web/app/menu/menu-api.ts` | Vuelve a la misma base URL que el resto. Sale `NEXT_PUBLIC_MENU_API_URL` |
| Specs web que fijan `localhost:3001` o `localhost:3002` | Pasan a `http://localhost:3000` |

### No se tocan

- `apps/payments/**`, `apps/menu/**` salvo que el gateway solo los llame por la URL que ya tienen.
- `payment.proto`, `menu.proto`, `order_lines.menu_item_id`.
- Cocina, totales, la saga de cobro, `table_sittings`.
- Evento de cocina.

Si hace falta un archivo fuera de esta lista, se anota en el chat y se acuerda antes de seguir.

## 3. Capas

| Dónde | Qué |
|-------|-----|
| Dominio de la orden | No cambia la máquina de estados ni el congelado de la línea. Abrir por mesa sigue exigiendo mesa existente y activa |
| Dominio del plano | Vive en Salón. La cuenta de mesa sigue en el dominio de la API |
| Application de la API | Puerto `TableCatalog`. `OpenOrder` lo usa. La API publica `HasActiveOrder` leyendo `listActiveByTableId`, el mismo criterio de `ACTIVE_ORDER_STATUSES` |
| Application de Salón | CRUD del plano. `DeactivateTable` llama a `ActiveOrdersQuery` y, si hay comanda, `TableHasActiveOrderError` |
| Gateway | Sin dominio, sin casos de uso de venta, sin Drizzle. Reenvía método, ruta, query, body y status |
| Web | Un adaptador de entrada. Una sola base URL |

## 4. Contrato

### 4.1 Puertos y procesos

| Proceso | REST | gRPC | Base |
|---------|------|------|------|
| Gateway | `3000`, público | no | no |
| API (órdenes) | `3001`, solo lo llama el gateway | `50054` `HasActiveOrder` | la de órdenes, ya sin `tables` al final |
| Menú | `3002` | `50052`, ya existe | `menu` |
| Salón | `3003` | `50053` `GetTable` | `salon` |
| Pagos | no | `50051`, ya existe | `payments` |

El navegador solo usa el `3000`. `MENU_GRPC_URL` y `PAYMENTS_GRPC_URL` siguen en el arranque de la API. Se suman `SALON_GRPC_URL=localhost:50053` en la API y `ORDERS_GRPC_URL=localhost:50054` en Salón.

### 4.2 Protobuf

Se cargan con `@grpc/proto-loader`. No se agrega `protoc`.

```protobuf
syntax = "proto3";
package restaurante.salon.v1;

service TableCatalogService {
  rpc GetTable(GetTableRequest) returns (TableSnapshot);
}

message GetTableRequest {
  string id = 1;
}

message TableSnapshot {
  string id = 1;
  string label = 2;
  string zone = 3;
  bool active = 4;
}
```

```protobuf
syntax = "proto3";
package restaurante.orders.v1;

service ActiveOrdersService {
  rpc HasActiveOrder(HasActiveOrderRequest) returns (HasActiveOrderReply);
}

message HasActiveOrderRequest {
  string table_id = 1;
}

message HasActiveOrderReply {
  bool active = 1;
}
```

`GetTable` de un id que no existe es `NOT_FOUND`. El adaptador lo vuelve `null` y `OpenOrder` lanza `TableNotFoundError`. Snapshot con `active = false`: `TableInactiveError`, sin insertar la orden. Si Salón no responde: `TableCatalogUnavailableError`. Una orden con `externalOrderId` no hace esta llamada.

`HasActiveOrder` responde `active = true` cuando `listActiveByTableId` no está vacío. Si la API no responde, Salón lanza `ActiveOrdersUnavailableError` y no desactiva la mesa.

### 4.3 REST que el gateway reenvía

El primer prefijo que coincida gana. El de la cuenta va antes que el del plano, porque los dos empiezan por `/tables`.

| Prefijo | Upstream |
|---------|----------|
| `/tables/:tableId/account` | API `3001` |
| `/tables` | Salón `3003` |
| `/menu-items` | Menú `3002` |
| `/orders` | API `3001` |

Cualquier otra ruta, incluido lo que parecería de Pagos, responde `404` del gateway. No se abre un upstream hacia `50051`.

El JSON de mesa sigue siendo `id`, `label`, `zone`, `active`. El de platos y el de órdenes no se rediseñan.

### 4.4 Bases

`CREATE DATABASE salon` en el mismo Postgres. El `0000` de Salón crea `tables` con los checks de hoy: id de 1 a 40, etiqueta y zona no vacías, `active` con default verdadero. Si el SQL trae órdenes, menú o pagos, se corrige el schema, `drizzle-kit drop` y se regenera.

`scripts/dev/copy-tables-out-of-orders.mjs` copia las filas. Se puede correr dos veces sin duplicar ids.

Después, el schema de la API deja de declarar `tables`. `db:generate` (0015) solo hace `DROP TABLE "tables"`. No toca `orders`, `order_lines` ni `table_sittings`. Si trae otro cambio, `drizzle-kit drop` de esa migración y se regenera. Si `db:migrate` falla, se para. No hay `ALTER` a mano.

### 4.5 Web

`NEXT_PUBLIC_API_URL` pasa a `http://localhost:3000` para menú, mesas, órdenes, cuenta y cobro. `menu-api.ts` deja de leer `NEXT_PUBLIC_MENU_API_URL`. Las rutas (`/menu-items`, `/tables`, `/orders`) no cambian.

## 5. Pruebas

### En Salón

Con `SALON_REPOSITORY_INTEGRATION=1` y `SALON_DATABASE_URL`. Si no están, el bloque se salta.

| Id | Qué demuestra |
|----|----------------|
| S4-1 | Alta, lista, cambio de zona y activar. Desactivar con `ActiveOrdersQuery` en falso deja `active = false` |
| S4-2 | El mismo desactivar con la consulta en verdadero lanza `TableHasActiveOrderError` y la mesa sigue activa |
| S4-3 | La consulta caída lanza `ActiveOrdersUnavailableError` y no guarda la baja |
| S4-4 | La base rechaza id vacío, etiqueta vacía y zona vacía |
| S4-5 | `GetTable` devuelve el snapshot. Un id desconocido es `NOT_FOUND` |

S4-1 a S4-3 entran por el caso de uso. S4-5 por el gRPC contra la base `salon`.

### En la API, sin los otros procesos

```bash
env -u DATABASE_URL pnpm --filter @restaurante/api test
pnpm --filter @restaurante/api typecheck
```

| Id | Qué demuestra |
|----|----------------|
| S4-6 | `OpenOrder` con mesa ausente es `TableNotFoundError`. Mesa inactiva es `TableInactiveError` y no guarda. Mesa activa abre y crea el sitting. `externalOrderId` no llama al catálogo |
| S4-7 | El adaptador: snapshot activo, `NOT_FOUND` → `null`, canal caído → `TableCatalogUnavailableError` |
| S4-8 | `HasActiveOrder` del servidor de la API: orden `OPEN` en esa mesa → `true`. Orden `CLOSED` o `CANCELLED` → `false` |

Los specs de cobro y de menú por gRPC que ya pasan siguen verdes. La cuenta de mesa no se mueve de paquete.

### Gateway

Sin base. Un doble de upstream, o tres puertos de prueba.

| Id | Qué demuestra |
|----|----------------|
| S4-9 | `POST /tables` llega a Salón y no a la API. `POST /tables/mesa-1/account/close` llega a la API y no a Salón |
| S4-10 | `GET /menu-items` llega a Menú. `POST /orders` llega a la API. `POST /payments` o una ruta desconocida es `404` y no intenta hablar con Pagos |

### Cruce

`SALON_GRPC_INTEGRATION=1` y el gateway en `3000`. Menú, API, Pagos y Salón levantados.

| Id | Qué demuestra |
|----|----------------|
| S4-11 | Por el `3000`: alta de mesa, orden con ese `tableId`, línea, cocina, totales y cierre en efectivo. La mesa está en la base `salon`. `tables` ya no está en la base de la API. El pago está en `payments` |
| S4-12 | Con esa orden todavía no cerrada, `POST /tables/:id/deactivate` por el `3000` responde el error de comanda activa y la mesa sigue activa. Tras cerrarla, el mismo `POST` la desactiva |
| S4-13 | Se apaga Salón. `POST /orders` con `externalOrderId` por el `3000` abre. `POST /orders` con `tableId` no abre. Una orden que ya estaba `READY` se cobra |

`pnpm --filter @restaurante/web test` con la base `http://localhost:3000` en menú, mesas, órdenes, cuenta y cobro. `apps/menu` y `apps/payments` no se modifican; si su test falla, se para para confirmar que no se editaron.

## 6. Demo de piso

Gateway en `3000`, API en `3001`, Menú en `3002`, Salón en `3003`, Pagos en `50051`.

1. `POST http://localhost:3000/tables` con id `mesa-fase4`, etiqueta y zona.
2. `POST http://localhost:3000/menu-items` con precio 1000 MXN, impuesto 0, un ingrediente y sin modificadores.
3. `POST http://localhost:3000/orders` con `{ "tableId": "mesa-fase4" }`.
4. Línea, `send-to-kitchen`, `begin-cooking`, `mark-ready`, totales y `POST /orders/:id/close` con efectivo, todo por el `3000`.
5. `POST http://localhost:3000/tables/mesa-fase4/deactivate` antes del cierre: la mesa sigue activa. Se repite después del cierre: `active = false`.
6. `POST http://localhost:3000/orders` con un `externalOrderId` nuevo, con Salón apagado: la orden abre.
7. `POST http://localhost:3000/payments` responde `404`.
8. En Postgres: la mesa está en `salon`. No hay tabla `tables` en la base de la API. El pago está en `payments`.

El navegador, con `NEXT_PUBLIC_API_URL=http://localhost:3000`, abre el plano, el menú, la comanda y el cobro sin llamar a `3001` ni a `3002`.

Sin la base `salon` o sin el gateway, la fase no se marca cerrada.

## 7. Fuera

- Evento `OrderSentToKitchen` y outbox.
- Partir cocina o totales. Mover `table_sittings` a Salón.
- Ruta pública de Pagos, o un gateway que traduzca REST a gRPC.
- Kubernetes y un Postgres por máquina.
- Reescribir el precio congelado de la línea o la saga de cobro.
- El plan de la fase 5. Se pide cuando esta fase esté cerrada en código.

## 8. Pasos

1. Leer el análisis de esta carpeta y las secciones 3, 5, 6 y 9 de `../analisis.md`. No abrir la fase 5.
2. Agregar `salon.proto` y `orders.proto` como en la sección 4.2.
3. Crear `apps/salon` con el plano mudado, REST en `3003` y `GetTable` en `50053`. `db:generate`, `CREATE DATABASE salon`, `db:migrate`. Dejar verdes S4-1 a S4-5.
4. Copiar las mesas con `scripts/dev/copy-tables-out-of-orders.mjs`.
5. Quitar `tables` del schema de la API. `db:generate` → solo ese `DROP TABLE` → `db:migrate`. Eso es 0015.
6. `TableCatalog` en `OpenOrder`, servidor `HasActiveOrder` en `50054`, y `DeactivateTable` en Salón contra ese puerto. Verdes S4-6, S4-7 y S4-8, más el typecheck de la API.
7. Crear `apps/gateway` en `3000` con el orden de prefijos de la sección 4.3. Verdes S4-9 y S4-10.
8. Procesos en `ecosystem.config.cjs`. La web a una sola `NEXT_PUBLIC_API_URL`. `pnpm dev:restart`.
9. Correr S4-11, S4-12, S4-13, el test de la web y la demo de la sección 6.
10. Anotar la corrida en `docs/desarrollo/pruebas-cttm.md`, con el nombre real del `0000` de Salón y del `0015`. No borrar las corridas anteriores.
11. En el plan general, marcar la fase 4 como cerrada en código. Marcar este archivo como cerrado, con la fecha y esas migraciones.

Si el paso 3 o el 5 falla, no se sigue. No se escribe SQL a mano. El gateway no se adelanta antes de que S4-1 a S4-8 estén verdes: si no, el `3000` escondería un plano que todavía vive en la API.

## 9. Siguiente paso

Cerrado. El siguiente paso es escribir el plan de la fase 5 cuando se pida. No se escribe en este turno.

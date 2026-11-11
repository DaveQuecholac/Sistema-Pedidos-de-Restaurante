# Plan de acción — Fase 1 · Soltar la FK de la línea al menú

**Fecha:** 28 de octubre de 2026  
**Análisis de la fase:** `analisis.md` en esta carpeta.  
**Corte:** `../analisis.md`. **Plan general:** `../plan-de-accion-general-corte-a-microservicios.md`.  
**Estado:** cerrado en código el 28 de octubre de 2026. Migración `apps/api/drizzle/0011_talented_scorpion.sql`. El punto 7 de la demo, sobre la orden ya cerrada, respondió 409 `OrderNotEditableError`; quedó anotado en `docs/desarrollo/pruebas-cttm.md`.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`. Esta fase es la que lo alinea con el corte (paso 11).

Un solo proceso y una sola base. Al cerrar, agregar una línea, pasarla por cocina y cobrarla sigue funcionando, y Postgres ya no exige que `order_lines.menu_item_id` exista en `menu_items`.

---

## 1. Resultado

`order_lines.menu_item_id` permanece `NOT NULL` y deja de ser clave foránea. El repositorio guarda y lee una línea cuyo plato no tiene fila en `menu_items`, con el nombre y el precio congelados. `AddLine` con un id desconocido sigue respondiendo `MenuItemNotFoundError` y no inserta nada.

**Señal:** la restricción `order_lines_menu_item_id_menu_items_id_fk` no está en `pg_constraint`, y el caso F3 de la sección 5 pasa.

## 2. Archivos

### Se tocan

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/infrastructure/persistence/drizzle/schema/order.ts` | `menuItemId` queda `text('menu_item_id').notNull()` sin `.references()`. Se quita el import de `menuItems` desde `./menu` (hoy solo sirve para esa FK, línea 12 y líneas 130-132) |
| `apps/api/drizzle/0011_*.sql`, `apps/api/drizzle/meta/0011_snapshot.json`, `apps/api/drizzle/meta/_journal.json` | Solo los que emita `pnpm --filter @restaurante/api db:generate`. La última entrada hoy es `0010_dark_mongoose` |
| `apps/api/src/infrastructure/persistence/drizzle/drizzle-order-repository.integration.spec.ts` | Casos F1, F2 y F3 |
| `.cursor/rules/dev-spec-gen1.mdc` | Texto del paso 11 |
| `docs/desarrollo/dev-spec-gen1.md` | El mismo texto |
| `docs/dev/comanda/02-persistencia-y-api/analisis.md` | Una línea de estado: la FK descrita ahí se quitó en esta fase. No se reescribe el plan histórico |
| `docs/desarrollo/pruebas-cttm.md` | Una corrida nueva al cerrar, sin borrar las anteriores |
| `docs/microservicios/plan-de-accion-general-corte-a-microservicios.md` | Al cerrar, la fila de la fase 1 pasa a «cerrada en código» |

### No se tocan

- `domain/**`, `application/**`, `interface/**`, `app.module.ts`, `apps/web/**`.
- `schema/menu.ts` y `schema/table.ts`.
- `order_line_modifiers`, `order_payments`, `table_sitting_payments`, `table_sittings`.
- Las migraciones `0000`–`0010`. No se editan.
- `packages/contracts`. No existe todavía. Nace en la fase 2.

Si hace falta un archivo fuera de esta lista, se anota en el chat y se acuerda antes de seguir.

## 3. Capas

| Capa | En esta fase |
|------|----------------|
| Dominio | No se toca. `LineItem.capture` sigue congelando nombre, precio, impuesto y modificadores. `menuItemId` sigue siendo obligatorio |
| Application | No se toca. `AddLine` y `ModifyLine` siguen llamando a `MenuRepository.findById` en el mismo proceso |
| Adaptador de persistencia | Cambia el schema Drizzle de `order_lines` y la migración. El mapper ya escribe `menuItemId` como texto (`order.mapper.ts`); no se reescribe |
| HTTP | No se toca. El JSON de la línea sigue exponiendo `menuItemId` |

## 4. Contrato

### 4.1 Schema

En `orderLines`, la columna queda así:

```ts
menuItemId: text('menu_item_id').notNull(),
```

Sin `.references(() => menuItems.id)`. El import de `./menu` sale de `schema/order.ts`.

Checks que se quedan en la misma tabla: nombre no vacío, precio `>= 0`, moneda de 3 caracteres, tasa `>= 0`, cantidad entre 1 y 99, posición `>= 0`, único `(order_id, position)`. La FK `order_lines.order_id` → `orders.id` con `ON DELETE cascade` se queda.

### 4.2 SQL que debe generar Drizzle Kit

Una sola sentencia de fondo, el `DROP CONSTRAINT` de esta FK:

```sql
ALTER TABLE "order_lines" DROP CONSTRAINT "order_lines_menu_item_id_menu_items_id_fk";
```

Drizzle puede envolverla con su `statement-breakpoint`. No puede traer otro `DROP`, ni `CREATE TABLE`, ni tocar `menu_items`, ni quitar `NOT NULL` de `menu_item_id`.

Si el archivo trae algo más: se corrige `schema/order.ts`, se elimina solo esa migración nueva con `drizzle-kit drop` y se vuelve a generar. No se edita el `.sql`, ni `_journal.json`, ni el snapshot a mano. Si `db:migrate` falla, se para. No hay `ALTER` a mano.

### 4.3 Lo que la base cumple después de migrar

```sql
SELECT conname
FROM pg_constraint
WHERE conname = 'order_lines_menu_item_id_menu_items_id_fk';
-- 0 filas

SELECT is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'order_lines'
  AND column_name = 'menu_item_id';
-- NO

SELECT conname
FROM pg_constraint
WHERE conname IN (
  'order_lines_order_id_orders_id_fk',
  'menu_item_ingredients_menu_item_id_menu_items_id_fk',
  'menu_item_modifiers_menu_item_id_menu_items_id_fk'
);
-- las tres siguen
```

### 4.4 Comportamiento que no cambia

| Entrada | Sigue |
|---------|--------|
| `POST /orders/:orderId/lines` con `menuItemId` que el menú no tiene | 422 `MenuItemNotFoundError`. No hay `INSERT` |
| `POST /orders/:orderId/lines` con un plato activo | 201, y la línea guarda id, nombre, precio e impuesto de ese momento |
| Desactivar un plato | Sigue siendo `active = false`. Esta fase no borra platos |

La base, a partir de aquí, acepta un `menu_item_id` sin fila. El caso de uso no aprovecha eso para crear líneas de platos inexistentes. La fase 3 será quien lea el menú por la red. Hoy la holgura solo se prueba en el repositorio, con una línea restaurada o capturada en memoria cuyo plato no se insertó.

### 4.5 Alineación del maestro

Gen 1 sigue describiendo el proceso que corre. El corte acordado deja de estar prohibido. En `.cursor/rules/dev-spec-gen1.mdc` y en `docs/desarrollo/dev-spec-gen1.md`, el mismo ajuste:

| Dónde | Queda |
|-------|--------|
| Fila «Sistema» | En ejecución: monolito modular, un solo despliegue. Objetivo acordado el 28 de octubre de 2026: microservicios, `docs/microservicios/analisis.md`. Cada fase espera su plan |
| Fila «Alcance» | RF1–RF5. El corte a microservicios sigue `docs/microservicios/plan-de-accion-general-corte-a-microservicios.md`, una fase por vez. Sin auth avanzada ni pasarelas reales |
| La prohibición que dice «sin microservicios» o «no se cablea microservicios» | Microservicios solo dentro de `docs/microservicios/` y de la fase cuyo plan ya esté abierto. Esta fase no crea procesos, gRPC ni gateway |

No se reescribe el resto de esos dos archivos. Las otras rules que todavía dicen «monolito» se dejan. Para quitar esta FK manda este plan. Para abrir la fase 2 manda el plan general: todavía no tiene plan específico.

## 5. Pruebas

Tres casos nuevos, todos en `drizzle-order-repository.integration.spec.ts`, dentro de `describeIntegration` (solo corren con `ORDER_REPOSITORY_INTEGRATION=1` y `DATABASE_URL`). Usan `inTransaction`, que revierte la transacción. F1 y F2 leen el catálogo y pueden ir fuera de la transacción.

### F1 — la FK ya no está

Consulta de la sección 4.3 sobre `order_lines_menu_item_id_menu_items_id_fk`. El resultado tiene 0 filas.

### F2 — la columna sigue

`menu_item_id` en `order_lines` existe y `is_nullable` es `NO`.

### F3 — la línea vive sin fila de menú

1. Crear un `MenuItem` en memoria (el helper `tacosDish` ya arma uno) y no llamar a `menuRepo.add`.
2. Abrir una orden y agregar `LineItem.capture` de ese plato, cantidad 1, sin modificadores.
3. `ordersRepo.add` de esa orden.
4. `findById` devuelve la línea con el mismo `menuItemId`, nombre `Tacos`, precio unitario `4500` MXN y tasa `1600`.
5. `SELECT id FROM menu_items WHERE id = <ese menuItemId>` dentro de la misma transacción devuelve 0 filas.

Hoy el paso 3 revienta por la FK. Después de migrar, pasa. No se inserta la línea a mano por SQL: entra por `DrizzleOrderRepository`, que es el adaptador de producto.

### Regresión de dominio y casos de uso

Sin `DATABASE_URL`. No se agregan casos: el comportamiento no cambia. Tiene que seguir verde, en particular:

| Spec | Qué protege |
|------|-------------|
| `application/order/add-line.spec.ts` | `menuItemId` inexistente lanza `MenuItemNotFoundError` y no guarda |
| `application/order/modify-line.spec.ts` | Modificar también relee el menú |
| `domain/order/line-item.spec.ts` y `order.spec.ts` | La copia de nombre y precio, y la máquina de estados |
| `application/payment/close-order.spec.ts` | El cierre no depende de la FK |
| `interface/http/order/order.controller.spec.ts` | `POST /orders/:id/lines` con id desconocido sigue en 422 |

Comando:

```bash
env -u DATABASE_URL pnpm --filter @restaurante/api test
pnpm --filter @restaurante/api typecheck
```

### Regresión de integración

Con Postgres migrado:

```bash
pnpm --filter @restaurante/api test:db
```

Eso corre menú, órdenes y mesas. Las de menú cubren las FK de ingredientes y modificadores, que esta fase no suelta. Las de órdenes que ya insertan el plato antes de la línea tienen que seguir pasando: quitar la FK no les rompe el camino feliz.

`apps/web` no se toca. No entra en la compuerta. Si una corrida de web falla, se trata como ajena a esta fase y se para para confirmar que no se editó la web.

### Si F3 pasa y F1 no

Parar. El caso estaría guardando por otro motivo y la restricción seguiría en la base.

### Si las unitarias de `AddLine` fallan

Parar. El cambio se salió del adaptador. No se «arregla» el caso de uso para aceptar platos inexistentes.

## 6. Demo de piso

La UI no cambia. La comprobación de sistema es el flujo HTTP de siempre, contra la API ya migrada (`http://localhost:3001`), más la consulta de la sección 4.3.

1. `POST /menu-items` con un plato de precio `{ "amount": 1000, "currency": "MXN" }`, impuesto `{ "basisPoints": 0 }`, un ingrediente y `modifiers: []`.
2. `POST /orders` con `{ "externalOrderId": "<id único>" }`.
3. `POST /orders/:orderId/lines` con `{ "menuItemId": "<id del paso 1>", "quantity": 1, "modifierIds": [] }`.
4. `POST /orders/:orderId/send-to-kitchen`, luego `begin-cooking`, luego `mark-ready`. Cuerpos `{}`.
5. `GET /orders/:orderId/totals`. El `total` que devuelva es el `expectedTotal` del cierre.
6. `POST /orders/:orderId/close` con `{ "expectedTotal": <ese total>, "payment": { "method": "cash", "tendered": <ese total> } }`. La orden queda `CLOSED`.
7. `POST /orders/:orderId/lines` con un `menuItemId` que no existe. Respuesta 422 `MenuItemNotFoundError`.
8. En Postgres, la restricción de la sección 4.3 sigue en 0 filas, y la línea del paso 3 tiene el `menu_item_id` del paso 1.

Sin Postgres o sin la API levantada, la fase no se marca cerrada. No se sustituye el paso 8 por una lectura del schema de Drizzle.

## 7. Fuera

- Procesos nuevos, gateway, gRPC, archivos `.proto`, `packages/contracts`.
- Mover tablas de pago o de cuenta de mesa.
- Puerto `MenuCatalog` y cliente de Menú.
- Dejar que `AddLine` persista un plato que el menú no conoce.
- Borrar platos, o cambiar `ON DELETE` de las FK internas del menú.
- Quitar `menuItemId` de la línea, del presenter o del body de `POST /orders/:id/lines`.
- Escribir el plan de la fase 2. Se pide aparte, cuando esta fase esté cerrada en código.

## 8. Pasos

1. Leer `analisis.md` de esta carpeta y las secciones 2.2 y 3 de `../analisis.md`. No abrir la fase 2.
2. Editar `schema/order.ts` como la sección 4.1.
3. `pnpm --filter @restaurante/api db:generate`.
4. Leer el `0011_*.sql` contra la sección 4.2. Si sobra algo, `drizzle-kit drop` de esa migración y volver al paso 2. No editar el SQL.
5. `pnpm --filter @restaurante/api db:migrate`.
6. Correr las tres consultas de la sección 4.3 en la base. Tienen que cumplirse antes de escribir los tests nuevos: si la FK sigue, el test F3 no tiene sentido.
7. Agregar F1, F2 y F3 en el spec de integración de órdenes.
8. Correr la regresión de la sección 5 (`test` sin `DATABASE_URL`, `typecheck`, `test:db`).
9. Recorrer la demo de la sección 6.
10. Anotar en `docs/desarrollo/pruebas-cttm.md` la corrida de esta fase, sin borrar las anteriores. Dejar dicho el nombre del `0011_*.sql` que salió de `db:generate`.
11. Ajustar los dos maestros con el texto de la sección 4.5. Agregar en `docs/dev/comanda/02-persistencia-y-api/analisis.md` una línea al inicio: la FK `order_lines.menu_item_id` se quitó en `docs/microservicios/01-soltar-fk/` y la columna se conservó.
12. En `docs/microservicios/plan-de-accion-general-corte-a-microservicios.md`, marcar la fase 1 como cerrada en código y dejar el siguiente paso en «escribir el plan de la fase 2 cuando se pida». Marcar este archivo como cerrado, con la fecha y el nombre de la migración.

Si el paso 5 o el 6 fallan, no se sigue con los tests ni con los docs.

## 9. Siguiente paso

Cerrado. El siguiente paso es escribir el plan de la fase 2 cuando se pida.

# Plan de acción — Tarea 2 · Persistencia y API de totales (E4)

**Rama:** `dev/totales`  
**Sprint:** 3 (RF4). Tarea 2 de 3. Solo esta.  
**Fecha:** 4 de octubre de 2026  
**Estado:** cerrada el 4 de octubre de 2026 (Pasos 0–5 + S1–S8).  
**Análisis:** `analisis.md` en esta carpeta.  
**Reglas de trabajo:** sección 5 de `../01-calculo-en-el-nucleo/plan-de-accion.md`.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Resultado

Un cliente HTTP pide `GET /orders/:id/totals` y recibe el desglose. Con `PUT …/discount` y `PUT …/tip` ajusta la cuenta y recibe el desglose nuevo. Al reiniciar la API, el ajuste sigue ahí y el total es el mismo centavo. Una orden cancelada responde 409 al ajustar y 200 al consultar. El JSON de `GET /orders/:id` y las pantallas del Sprint 2 no cambian.

## 2. No se toca

- Dominio y casos de la tarea 1. Si algo no alcanza, se para y se vuelve a la tarea 1.
- `order.presenter.ts`, `order.schema.ts`, `order.controller.ts`, `order-http.errors.ts` y su spec.
- Menú: dominio, casos, `schema/menu.ts`, `DrizzleMenuRepository`, HTTP.
- `client.ts`, `main.ts`, health.
- Migraciones `0000`–`0005`, `_journal.json` y snapshots, a mano.
- `apps/web/**`.

## 3. Decisiones

| Tema | Decisión |
|------|----------|
| Columnas | Ocho en `orders`, nulas, sin default (sección 4 del análisis) |
| Checks | Variante válida y forma exacta por variante, para descuento y para propina |
| Descuento fijo | Se guarda lo pedido; lo aplicado se calcula al leer |
| Escritura | `add` y `save` escriben las ocho columnas en la misma transacción de siempre |
| Rutas | `GET /orders/:orderId/totals`, `PUT /orders/:orderId/discount`, `PUT /orders/:orderId/tip` |
| Respuesta | El desglose, también en los `PUT` |
| Zod | `.strict()`, `discriminatedUnion` por `kind`, `nullable`. Sin rangos |
| Errores | Tabla propia en `totals-http.errors.ts`; lo demás delega en `toOrderHttpError` |
| Tests HTTP | Módulo Nest de prueba con dobles en memoria, puerto libre. Sin `AppModule` ni Drizzle |
| Tests Drizzle | Rollback por caso, en el spec de integración de órdenes que ya existe |

## 4. Archivos

- `apps/api/src/infrastructure/persistence/drizzle/schema/order.ts`
- `apps/api/drizzle/0006_*.sql` + `meta/` (**solo** de `db:generate`)
- `apps/api/src/infrastructure/persistence/drizzle/order.mapper.ts`
- `apps/api/src/infrastructure/persistence/drizzle/drizzle-order-repository.ts`
- `apps/api/src/infrastructure/persistence/drizzle/drizzle-order-repository.integration.spec.ts` (P15–P22)
- `apps/api/src/interface/http/totals/totals.schema.ts`
- `apps/api/src/interface/http/totals/totals.presenter.ts`
- `apps/api/src/interface/http/totals/totals-http.errors.ts`
- `apps/api/src/interface/http/totals/totals.controller.ts` · `totals.controller.spec.ts`
- `apps/api/src/app.module.ts`

## 5. Pasos

Cada paso cierra con API test y typecheck en verde; los pasos 1 y 2 además con `pnpm --filter @restaurante/api test:db` (con `DATABASE_URL` de `apps/api/.env`).

### Paso 0 — Línea base

1. `pnpm dev:status`: API y web online. `GET /health/database` 200.
2. API test: número del cierre de la tarea 1. `test:db`: **22**.
3. `select count(*) from orders` → anotar.
4. `GET /menu-items`: Tacos de suadero `4500`/`1600` con Queso `1500`; Agua de jamaica `2500`/`0`. Si cambiaron, recalcular los valores esperados de S2–S6 con la sección 5.8 del análisis de la tarea 1 antes de seguir.

**Línea base — 4 de octubre de 2026**

| Comando | Resultado |
|---------|-----------|
| `pnpm dev:status` | `restaurante-api` y `restaurante-web` online |
| `GET /health/database` | 200 `{"status":"ok","service":"restaurante-api"}` |
| `env -u DATABASE_URL pnpm --filter @restaurante/api test` | **289** passed + **22** skipped (cierre tarea 1) |
| `pnpm --filter @restaurante/api test:db` | **22** passed |
| `pnpm --filter @restaurante/api typecheck` | OK |
| `select count(*) from orders` | **26** |
| Carta | Tacos de suadero `4500`/`1600`, Queso `1500`; Agua de jamaica `2500`/`0`, Chía `500` — sin recalcular S2–S6 |

Piso de la tarea: API **289** + 22 skipped; `test:db` **22**. No pueden bajar.

### Paso 1 — Esquema y migración

1. Columnas y checks en `schema/order.ts`.
2. `pnpm --filter @restaurante/api db:generate`.
3. **Revisar el SQL antes de migrar:**
   - Solo `ALTER TABLE "orders" ADD COLUMN …` y `ADD CONSTRAINT … CHECK`.
   - Ninguna columna `NOT NULL`, ningún `DEFAULT`, ningún `DROP`, `UPDATE` ni `INSERT`.
   - No toca `order_lines`, `order_line_modifiers` ni tablas del menú.
4. `pnpm --filter @restaurante/api db:migrate`.
5. `\d orders`: ocho columnas nuevas y cuatro checks. `select count(*) from orders` igual al del paso 0. `select count(*) from orders where discount_kind is not null or tip_kind is not null` → 0.

Si el SQL no cumple: se corrige `schema/order.ts`, se borra **solo** la migración recién generada con `drizzle-kit drop` y se vuelve a generar. No se edita el SQL. Si la migración falla en la base, parar; no se aplica `ALTER` a mano. Si no hay Postgres, parar.

**Hecho — 4 de octubre de 2026**

| Chequeo | Resultado |
|---------|-----------|
| Migración | `0006_shocking_the_captain.sql` — solo `ADD COLUMN` × 8 y `ADD CONSTRAINT CHECK` × 4 en `orders` |
| `\d orders` | ocho columnas nulas + `orders_discount_kind/shape` + `orders_tip_kind/shape` |
| `count(*)` orders | **26** (igual que paso 0) |
| con ajuste no nulo | **0** |
| API test | **289** + 22 skipped |
| `test:db` | **22** |
| Typecheck | OK (`orderRow` escribe `null` en las 8 columnas; el mapeo real es el Paso 2) |

### Paso 2 — Mapper y repositorio

1. Mapper en las dos direcciones; errores de dominio → `OrderMappingError`.
2. `add` inserta las columnas; `save` las incluye en el `set`.
3. Pruebas P15–P22. P1–P14 de órdenes y P1–P8 del menú siguen.

**Control:** quitar las columnas de propina del `set` de `save` → P16 falla. Restaurar.

**Hecho — 4 de octubre de 2026**

| Chequeo | Resultado |
|---------|-----------|
| Mapper | lee/escribe `Discount` y `Tip`; errores de dominio → `OrderMappingError` |
| `add` / `save` | las ocho columnas |
| P15–P22 | pasan |
| Control P16 (sin tip en `set`) | falla como se espera; restaurado |
| P1–P14 + menú P1–P8 | siguen |
| Migración extra | `0007_omniscient_ted_forrester` — endurece shape: `fixedAmount` exige `currency is not null` (Postgres trataba `length(null)=3` como OK) |
| `test:db` | **30** passed |
| API test | **289** + 30 skipped (más specs de integración omitidos sin `DATABASE_URL`) |
| Typecheck | OK |

### Paso 3 — HTTP sin base

Archivos de `interface/http/totals/`. Spec con `NestFactory` en puerto `0`, logger apagado, dobles en memoria, mismo generador y reloj del spec de órdenes. La orden **L** se arma por HTTP con el `OrderController` registrado en el mismo módulo de prueba. Pruebas H26–H44.

```ts
const adjustment = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('percentage'), basisPoints: z.number() }).strict(),
  z.object({ kind: z.literal('fixedAmount'), amount: z.number() }).strict(),
]);
export const setDiscountBodySchema = z.object({ discount: adjustment.nullable() }).strict();
export const setTipBodySchema = z.object({ tip: adjustment.nullable() }).strict();
```

**Control:** quitar `OrderTotalsNotAdjustableError` de la tabla de errores → H36 falla (500 en lugar de 409). Restaurar.

**Hecho — 4 de octubre de 2026**

| Chequeo | Resultado |
|---------|-----------|
| Archivos | `totals.schema.ts`, `totals.presenter.ts`, `totals-http.errors.ts`, `totals.controller.ts`, `totals.controller.spec.ts` |
| H26–H44 | pasan (20 tests) |
| Control H36 (sin mapeo) | 500 en lugar de 409; restaurado |
| API test | **309** + 30 skipped (289 + H26–H44) |
| Typecheck | OK |
| AppModule | aún sin cablear (Paso 4) |
| App / web | no se ve: rutas no registradas en el arranque |

### Paso 4 — Cableado

En `AppModule.register`: `CalculateTotals`, `SetOrderDiscount`, `SetOrderTip` con `inject: [ORDER_REPOSITORY]`, y `TotalsController` en `controllers`. Nada más cambia en el módulo.

**Hecho — 4 de octubre de 2026**

| Chequeo | Resultado |
|---------|-----------|
| `AppModule` | `TotalsController` + tres casos de uso con `ORDER_REPOSITORY` |
| API test | **309** + 30 skipped |
| Typecheck | OK |
| Arranque | rutas `GET …/totals`, `PUT …/discount`, `PUT …/tip` mapeadas |
| Sonda | `GET /orders/no-existe/totals` → 404 `OrderNotFoundError` |
| Web | menú/comanda/cocina 200; sin UI de totales (tarea 3) |

### Paso 5 — Smoke y cierre

1. API test, `test:db`, typecheck.
2. `pnpm dev:restart`.
3. S1–S8 contra `http://localhost:3001`.
4. Anotar la sección 10.

**Hecho — 4 de octubre de 2026**

| Chequeo | Resultado |
|---------|-----------|
| API test | **309** + 30 skipped |
| `test:db` | **30** |
| Typecheck | OK |
| S1–S8 | todos PASS (ids en §10) |

## 6. Catálogo con Postgres

Todas hacen rollback. Platos insertados con `DrizzleMenuRepository` en la misma transacción, como P1–P14.

| Id | Entonces |
|----|----------|
| P15 | `add` de orden nueva: columnas de ajuste nulas; `findById` trae `discount` y `tip` `null` |
| P16 | `save` con descuento `percentage` 1000 y propina `fixedAmount` 2000; releer: iguales; `version` 1 |
| P17 | `save` que quita los dos; releer: `null`; columnas nulas |
| P18 | `save` solo de propina sobre una con descuento guardado; releer: el descuento sigue |
| P19 | Dos lecturas; `save` de la primera con propina 10 %, `save` de la segunda con 15 % | la segunda lanza `OrderConcurrencyError`; queda 10 % |
| P20 | Por SQL: `discount_kind = 'coupon'`; `percentage` con `basis_points` 0 y 10001; `percentage` con `amount`; `fixedAmount` con `amount` 0; `fixedAmount` sin moneda | `23514` en cada uno |
| P21 | Por SQL: lo mismo de P20 para `tip_*` | `23514` |
| P22 | Fila con `discount_currency = 'USD'` (el check la deja) | `findById` lanza `OrderMappingError` |

## 7. Catálogo HTTP sin Postgres

Orden **L**: Tacos × 2 con Queso + Agua × 1 (fixtures de la tarea 1).

| Id | Petición | Entonces |
|----|----------|----------|
| H26 | `GET /orders/:id/totals` | 200; JSON de la sección 6 del análisis con total 16420, `adjustable` true, `discount` y `tip` `null` |
| H27 | `GET /orders/no-existe/totals` | 404 `OrderNotFoundError` |
| H28 | `PUT …/discount` `percentage` 1000 | 200; descuento 1450; total 14778 |
| H29 | `PUT …/discount` `fixedAmount` 5000 | 200; `requested` y `amount` 5000; total 10758 |
| H30 | `PUT …/discount` `{ "discount": null }` | 200; `discount` `null`; total 16420 |
| H31 | H28 y luego `PUT …/tip` `percentage` 1000 | 200; propina 1305; total 16083 |
| H32 | `PUT …/tip` `fixedAmount` 2000; luego `{ "tip": null }` | 200 / 200 sin propina |
| H33 | Cuerpos `{}`, campo extra, `basisPoints: "10"`, sin `kind`, `kind: "coupon"`, `amount: "50"` | 400 `InvalidRequest` en cada uno |
| H34 | `basisPoints` 0, 10001 y 1.5 | 422 `InvalidPercentageError` |
| H35 | `fixedAmount` 0; `amount` -5 | 422 `InvalidDiscountError`; 422 `InvalidMoneyError` |
| H36 | Orden cancelada: `PUT …/tip`; `GET …/totals` | 409 `OrderTotalsNotAdjustableError`; 200 con `adjustable` false |
| H37 | Orden en `SENT_TO_KITCHEN`, `IN_KITCHEN` y `READY`: `PUT …/tip` | 200 en los tres |
| H38 | Doble espía que guarda otra versión justo antes del `save` de `SetOrderTip` | 409 `OrderConcurrencyError`; `GET` muestra lo del otro |
| H39 | Orden con una línea que desborda | 422 `MoneyOverflowError` en `GET …/totals` |
| H40 | Doble que lanza `Error` | 500 sin `code` de dominio inventado |
| H41 | H33–H36 | el doble no recibió `save` |
| H42 | Cuerpo con `orderId` | 400 |
| H43 | `GET /orders/:id` tras ajustar descuento y propina | mismas llaves que en el Sprint 2; sin `totals`, `discount` ni `tip`; `allowedActions` igual |
| H44 | `GET …/totals` dos veces | cuerpos idénticos byte a byte |

H1–H25 del Sprint 2 siguen sin cambio.

## 8. Smoke de sistema

Con `pnpm dev:restart`, base real, sin rollback. Prefijo de mesa `D3-API-`. Las órdenes quedan en la base; no son seeds; se anotan en la sección 10.

| Id | Pasos | Entonces |
|----|-------|----------|
| S1 | `GET /health`, `/health/database`, `/menu-items` | 200; precios y tasas del paso 0 |
| S2 | `POST /orders` mesa `D3-API-1`; Tacos × 2 con Queso; Agua × 1; `GET …/totals` | total 16420 |
| S3 | `PUT …/discount` 10 %; `PUT …/tip` 10 % | 14778; 16083 |
| S4 | `pnpm dev:restart`; `GET …/totals` | 16083 igual |
| S5 | `send-to-kitchen`; `PUT …/tip` 15 %; `POST …/lines` | 200 `SENT_TO_KITCHEN`; 200 total 16736; 409 `OrderNotEditableError` |
| S6 | Orden `D3-API-2` con una línea; `cancel`; `PUT …/tip` 10 %; `GET …/totals` | 409 `OrderTotalsNotAdjustableError`; 200 `adjustable` false |
| S7 | `psql`: columnas de ajuste de `D3-API-1` | descuento `percentage` 1000; propina `percentage` 1500 |
| S8 | `GET /orders/:id` de `D3-API-1`; `https://restaurante.localhost/menu`, `/orders`, `/kitchen` | JSON sin totales; 200 en las tres páginas |

```bash
curl -sS http://localhost:3001/orders/$ORDER_ID/totals
curl -sS -X PUT http://localhost:3001/orders/$ORDER_ID/discount -H 'Content-Type: application/json' \
  -d '{"discount":{"kind":"percentage","basisPoints":1000}}'
curl -sS -X PUT http://localhost:3001/orders/$ORDER_ID/tip -H 'Content-Type: application/json' \
  -d '{"tip":{"kind":"percentage","basisPoints":1000}}'
PGPASSWORD=postgres /usr/pgsql-18/bin/psql -h localhost -U postgres -d restaurante \
  -c "select discount_kind, discount_basis_points, tip_kind, tip_basis_points from orders where id = '$ORDER_ID'"
```

## 9. Hecho cuando

- [x] Migración `0006` generada por Drizzle Kit, revisada y aplicada; filas previas intactas
- [x] P15–P22 pasan junto con P1–P14 de órdenes y P1–P8 del menú
- [x] H26–H44 pasan; H1–H25 sin cambio
- [x] Los controles de los pasos 2 y 3 fallaron al romper y pasaron al restaurar
- [x] S1–S8 anotados con ids
- [x] Ningún JSON trae nombres de tabla ni `version`
- [x] `domain/` y `application/` no importan Drizzle, Nest, Zod ni HTTP
- [x] Solo `AppModule` instancia adaptadores en el arranque
- [x] `apps/web` no cambió

## 10. Cierre

Cerrado el 4 de octubre de 2026.

| Familia | Comando | Resultado |
|---------|---------|-----------|
| Línea base | paso 0 | API 289 + 22 skipped; test:db 22; orders=26; carta OK (4 oct 2026) |
| Migración | `db:generate` + `db:migrate` + `\d orders` | `0006_shocking_the_captain` (+ `0007` shape); 8 cols + checks; orders=26 |
| Integración | `pnpm --filter @restaurante/api test:db` | **30** (P1–P22 órdenes + P1–P8 menú) |
| Unit / HTTP | `env -u DATABASE_URL pnpm --filter @restaurante/api test` | **309** + 30 skipped |
| Typecheck | `pnpm --filter @restaurante/api typecheck` | OK |
| Smoke | S1–S8 | todos PASS |

| Id smoke | order id | Estado final |
|----------|----------|--------------|
| S1 | — | health/DB/carta OK |
| S2–S5, S7–S8 | `3d144fa4-e6d3-402f-bf84-2194adafde66` (mesa `D3-API-1`) | `SENT_TO_KITCHEN`; descuento 10 %; propina 15 %; total 16736 |
| S6 | `61ecd29e-b4e2-4594-b92b-203f39d97ac1` (mesa `D3-API-2`) | `CANCELLED`; tip 409; `adjustable` false |

Siguiente tarea del sprint: `docs/dev/totales/03-pantalla-cuenta-y-demo/`.

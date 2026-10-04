# Guía de pruebas CTTM

**Para qué sirve:** repetir las mismas pruebas cada vez que se cierre una tarea, o cada vez que el código nuevo llegue a 1000 líneas.  
**Fecha de esta corrida:** 4 de octubre de 2026.  
**Alcance de esta corrida:** núcleo de órdenes y cocina (Sprint 2, tarea 1 en `dev/comanda`), sin persistencia ni pantalla. Las corridas anteriores quedan abajo y no se borran.

No hay un estándar público con el nombre CTTM. Aquí el nombre cubre las cuatro frentes que usa el equipo. No es una certificación TMMi.

| Letra | Frente | Pregunta |
|-------|--------|----------|
| **C** | Código | ¿Las capas están bien y las pruebas de unidad pasan? Se revisa en bloques de hasta 1000 líneas. |
| **T** | Integración | ¿El caso de uso, el adaptador y Postgres se hablan? |
| **T** | Sistema | ¿`pnpm dev` deja API, web y Postgres usables a la vez? |
| **M** | Madurez | ¿La tarea tiene evidencia, huecos anotados y se puede repetir? |

## Cuándo correrla

1. Al cerrar el plan de una tarea, antes de decir que quedó lista.
2. Al acumular 1000 líneas nuevas de producto desde la revisión anterior. Hoy el repo está por debajo de ese corte, así que cabe en un solo bloque.
3. Si un doc y el código se contradicen: parar, anotar el choque y no marcar la tarea como madura.

Qué no sustituye esta guía: los casos de menú, órdenes o cobro. Esos entran cuando exista su plan.

## C — Código

Un bloque = como máximo 1000 líneas de `apps/`, `scripts/` y la migración Drizzle. Dentro del bloque:

- [ ] El dominio no importa Nest, Next, Drizzle, HTTP ni Postgres.
- [ ] El caso de uso solo conoce puertos. El adaptador está en `infrastructure/`. El cableado está en el módulo Nest.
- [ ] `pnpm --filter @restaurante/api test` pasa sin `DATABASE_URL`.
- [ ] `pnpm --filter @restaurante/api typecheck` pasa.
- [ ] En el caso de uso y en su spec no hay imports de `drizzle-orm`, `postgres` ni `@nestjs/*`.
- [ ] La migración SQL salió de `db:generate`. No hay SQL escrito a mano ni `_journal.json` editado a mano.
- [ ] Nombres públicos de la API en vocabulario de producto. Los nombres de tabla no salen en el JSON.

Comandos:

```bash
env -u DATABASE_URL pnpm --filter @restaurante/api test
pnpm --filter @restaurante/api typecheck
```

## T — Integración

La API ya arrancó con la URL de `apps/api/.env`. Postgres es el servicio `postgresql-18`.

- [ ] `select 1` contra `restaurante` devuelve 1.
- [ ] Existen `menu_items` y `menu_item_modifiers` con las columnas del plan de la tarea 1.
- [ ] Un extra con precio se guarda. Una exclusión se guarda con precios nulos.
- [ ] La base rechaza nombre vacío, precio negativo, tasa negativa, `kind` inválido, extra sin precio y exclusión con precio.
- [ ] `GET http://localhost:3001/health` es `{ "status": "ok", "service": "restaurante-api" }`.
- [ ] `GET http://localhost:3001/health/database` es el mismo cuerpo cuando la base responde.
- [ ] Si `DATABASE_URL` es imposible, el proceso sale antes de escuchar. `GET /health` no responde en ese puerto.

```bash
PGPASSWORD=postgres /usr/pgsql-18/bin/psql -h localhost -U postgres -d restaurante -c 'select 1'
curl -sS http://localhost:3001/health
curl -sS http://localhost:3001/health/database
```

El detalle de inserciones (D3–D9) está en `docs/dev/plataforma/01-base-de-datos-y-arranque/plan-de-accion.md`. No son tests de dominio.

## T — Sistema

- [ ] `pnpm dev` enciende Postgres si estaba apagado, y luego API y web.
- [ ] `https://restaurante.localhost/` muestra la home actual («Sistema de Pedidos»). `pnpm dev:plain` y `pnpm dev:web` siguen en el puerto 3000.
- [ ] `pnpm dev:stop` para API y web y deja Postgres encendido.
- [ ] Tras un cambio visible en `apps/web`, `pnpm dev:restart` antes de mirar el navegador.

```bash
pnpm dev:restart
curl -sS --cacert "$HOME/.portless/ca.pem" -o /dev/null -w '%{http_code}\n' https://restaurante.localhost/
```

## M — Madurez

Una tarea está madura para este repo cuando:

- [ ] El plan tiene resultado por prueba (pasó o falló), con fecha.
- [ ] El núcleo de lo que se afirmó se puede probar sin navegador. La base, cuando el plan la pide, está migrada con Drizzle Kit.
- [ ] Los huecos quedan escritos aquí o en el cierre del plan. No se esconden.
- [ ] No se adelantó el alcance de la tarea siguiente.

Niveles usados solo como idioma interno. No son niveles TMMi oficiales.

| Nivel | Significado en este repo |
|-------|--------------------------|
| 1 Inicial | Hay código y las pruebas son recuerdos, sin lista ni resultado. |
| 2 Repetible | Esta guía se ejecutó y el resultado quedó anotado. |
| 3 Del producto | El requisito de negocio (RF) tiene caso de uso, prueba y demo. La tarea 1 no llega aquí: no incluye el menú. |

## Cómo anotar el resultado

Al final de la corrida, añadir una sección «Corrida» con fecha, rango de líneas y una fila por frente: pasó, falló o no aplica. Si falló, el síntoma y el archivo. No borrar corridas viejas.

## Corrida — 30 de septiembre de 2026

**Bloque de código:** 1 de 1. Unas 760 líneas entre `apps/`, `scripts/`, el ecosystem y la migración (el spec de Vitest va aparte, 28 líneas). No hace falta un segundo bloque de 1000.

**Comandos de esta corrida:** test de la API sin `DATABASE_URL`, typecheck de la API, `GET /health`, `GET /health/database`, home en el puerto 3000, y `\dt` de las dos tablas. U1, U2, D1–D9 y S1–S4 ya estaban anotados el mismo día en el plan de la tarea 1; esta corrida volvió a ver en vivo S1, la home y las tablas.

| Frente | Resultado | Nota |
|--------|-----------|------|
| C Código | Pasó | 2 tests, typecheck limpio. Dominio sin imports. Drizzle y Nest solo en adaptador, HTTP y arranque. |
| T Integración | Pasó | `/health` y `/health/database` en 200 con el cuerpo del plan. Las dos tablas existen. |
| T Sistema | Pasó | La home responde 200 y muestra «Sistema de Pedidos». API y web estaban arriba. |
| M Madurez | Nivel 2 para la tarea 1 | Evidencia en el plan y en esta guía. El producto (RF1–RF5) sigue en nivel 1: no hay casos de menú. |

### Huecos de esa corrida, corregidos el mismo día

1. `GET /health/database` ahora se prueba con la API escuchando en un puerto libre: 200 si el puerto de base responde, y 503 con `{ "status": "unavailable", "service": "restaurante-api" }` si falla. El cuerpo no incluye el mensaje del driver. Archivo: `apps/api/src/interface/http/controllers/database-health.controller.spec.ts`.
2. `pnpm dev:restart` vuelve a leer `ecosystem.config.cjs` (`--update-env`). Antes reiniciaba por nombre y PM2 avisaba que las variables no se actualizaban.
3. El lector de `apps/api/.env` acepta `export` y comillas simples o dobles, y no pisa una variable que el proceso ya traiga. Prueba: `apps/api/src/load-api-env.spec.ts`.

Nada de eso adelanta menú, órdenes ni cobro.

## Corrida — 30 de septiembre de 2026, menú tareas 1 y 2

**Bloques de código:** 2. Unas 1711 líneas de producto en `apps/`, `scripts/`, `ecosystem.config.cjs` y las migraciones SQL, sin specs y sin `drizzle/meta`. Los specs van aparte (unas 900 líneas ya rastreadas, más los nuevos de menú).

| Bloque | Líneas | Qué se revisó |
|--------|--------|----------------|
| 1 | 940 | Dominio, casos de uso, web, scripts, ecosystem y config de la API |
| 2 | 733 | `main.ts`, carga de `.env`, `AppModule`, Drizzle, HTTP de menú y las migraciones `0000` y `0001` |

| Frente | Resultado | Nota |
|--------|-----------|------|
| C Código | Pasó | `env -u DATABASE_URL pnpm --filter @restaurante/api test`: 12 archivos, 66 pruebas; 8 skipped a propósito (P1–P8). Typecheck de la API pasó. Dominio y casos sin Nest, Drizzle, Postgres ni Zod. El JSON de `GET /menu-items` usa `MenuItem`, `price`, `applicableTax` y `modifiers`; no salen nombres de tabla. `0001_chilly_quasar.sql` salió de `db:generate`. |
| T Integración | Pasó | `select 1` devolvió 1. Las dos tablas están, con `position` en los modificadores. El plato `d11d0b9f-dd9b-4010-b0fe-1ad1a63a62fa` sigue con extra en posición 0 y exclusión con precios nulos. Nombre en blanco, precio negativo, tasa negativa, `kind` inválido, extra sin precio y exclusión con precio caen en check `23514`; esa prueba hizo rollback. `test:db`: 8 pruebas, P1–P8. Health y health/database en 200 con `{"status":"ok","service":"restaurante-api"}`. Una API aparte con URL imposible salió con código 1 y no escuchó el puerto 3099. La de 3001 siguió arriba. |
| T Sistema | Pasó | Postgres ya estaba encendido; `pnpm dev` lo dejó así y volvió a levantar API y web. La home responde 200 y muestra «Sistema de Pedidos». `pnpm dev:stop` apagó API y web; `select 1` siguió respondiendo. Después `pnpm dev` dejó otra vez health y home en 200. No hubo cambio en `apps/web`, así que no aplica un reinicio extra para mirar el navegador. |
| M Madurez | Nivel 2 de la rama | Los planes de las tareas 1 y 2 tienen resultado y fecha. El núcleo de menú se prueba sin navegador. La pantalla admin no está: es la tarea 3 y no se adelantó. RF1 no llega a nivel 3 hasta esa demo. |

### Huecos de esta corrida

1. `pnpm test` deja P1–P8 en skipped. No es un fallo: `pnpm test:db` las corre y pasaron en esta misma corrida.
2. Queda la fila `d11d0b9f-dd9b-4010-b0fe-1ad1a63a62fa` (`Tacos de suadero`, inactiva). Es el plato del smoke de la tarea 2, no un seed. No se borró.
3. El cierre de la tarea 1 dice que `AppModule` no menciona el menú. Eso era cierto al cerrarla. La tarea 2 lo cablea a propósito. El plan de la tarea 2 manda.
4. No se apagó el servicio `postgresql-18` para ver el encendido en frío. El script avisó que ya estaba encendido.

## Corrida — 30 de septiembre de 2026, por la tarde

**Alcance:** ingredientes del plato, la regla de que un omitir nombra un ingrediente, la pantalla admin y el enlace `https://restaurante.localhost`.  
**Bloques de código:** 4. Unas 3594 líneas de producto en `apps/`, `scripts/`, `ecosystem.config.cjs` y los SQL de `apps/api/drizzle/`, sin specs y sin `drizzle/meta`. Los cuatro bloques quedan en 873, 982, 982 y 757 líneas.

La revisión de capas miró los imports de dominio, casos de uso y web. El dominio de producto no importa Nest, Next, Drizzle ni Postgres. Los specs de dominio sí importan Vitest. Los casos de uso solo ven `MenuRepository`. `AppModule` elige `DrizzleMenuRepository`. La web llama el HTTP; no importa el dominio.

| Frente | Resultado | Nota |
|--------|-----------|------|
| C Código | Pasó | API sin `DATABASE_URL`: 12 archivos, 67 pruebas, 8 skipped (P1–P8). Typecheck de API y web limpio. Web: 2 archivos, 14 pruebas. `GET /menu-items` usa `id`, `name`, `price`, `applicableTax`, `active`, `ingredients`, `modifiers`. No salen nombres de tabla. La tabla `menu_item_ingredients` salió de `db:generate` (`0002_glossy_master_mold.sql`). |
| T Integración | Pasó | `select 1` devolvió 1. Están `menu_items`, `menu_item_modifiers` y `menu_item_ingredients`. Los cinco platos guardan extra con precio y exclusión con precio nulo, y los ingredientes del plato. Nombre vacío, precio negativo, tasa negativa, `kind` inválido, extra sin precio, exclusión con precio e ingrediente en blanco caen en `23514`; el caso hace rollback. `test:db`: 8 pruebas. Health y health/database en 200 con `{"status":"ok","service":"restaurante-api"}`. Una API en el puerto 3099 con URL imposible salió con código 1 y no escuchó. La de 3001 siguió arriba. |
| T Sistema | Pasó | Postgres ya estaba encendido. `pnpm dev:stop` apagó API y web; `select 1` siguió. `pnpm dev` los volvió a levantar. Health en 200. La home en `https://restaurante.localhost/` responde 200 y muestra «Sistema de Pedidos» y «Administrar menú». El puerto 3000 no abre: con `pnpm dev` la web va por portless. |
| M Madurez | Nivel 3 para el catálogo de menú | Hay caso de uso, prueba sin navegador y pantalla. Órdenes, cocina, totales y cobro siguen sin construir. |

### Huecos de esta corrida, cerrados el mismo día

1. Se quitó el `INSERT` a mano de `0002_glossy_master_mold.sql`. Esa copia ya no hace falta: una base nueva no tiene exclusiones al crear la tabla, y el catálogo actual se cargó por el API.
2. `0003_unknown_rick_jones.sql` liga cada exclusión al ingrediente del mismo plato. La columna `ingredient_id` es nula en el extra y obligatoria en el omitir. La llave `menu_item_modifiers_same_item_ingredient_fk` rechaza el ingrediente de otro plato (`23503`). El check `menu_item_modifiers_price_by_kind` rechaza el omitir sin ingrediente (`23514`). El `UPDATE` de esa migración rellena los cinco platos que ya estaban, para que el check no los tire. Al leer, si el nombre no coincide con ese ingrediente, el mapper no arma el plato.
3. El plato `d11d0b9f-dd9b-4010-b0fe-1ad1a63a62fa` no se restaura. El catálogo pedido son los cinco platos de la demo.
4. No se apaga `postgresql-18`. Es el servicio del sistema, y `scripts/ensure-postgres.mjs` solo lo enciende si está apagado.

## Corrida — 4 de octubre de 2026, comanda tarea 1 (núcleo)

**Alcance:** `Order`, `LineItem`, estados de cocina, puerto `OrderRepository`, doble en memoria y nueve casos de uso (RF2–RF3). Sin Drizzle de órdenes, sin HTTP de órdenes, sin pantallas `/orders` ni `/kitchen`.  
**Plan cerrado:** `docs/dev/comanda/01-orden-y-cocina/plan-de-accion.md` (sección 11).  
**Bloques de código nuevo de producto (sin specs ni fixtures):** 2. Unas **1150** líneas en `domain/order`, `application/order` y `ports/order-repository.ts`.

| Bloque | Líneas | Qué se revisó |
|--------|--------|----------------|
| 1 | 575 | Dominio: origen, cantidad, línea, estados, agregado, errores |
| 2 | 575 | Application: puerto, doble, errores de repo, nueve casos de uso |

### Hexagonal (revisión de capas)

- Dominio de orden: sin Nest, Next, Drizzle, postgres, Zod ni `infrastructure/`.
- Casos de uso: solo `OrderRepository` / `MenuRepository` y dominio. Sin `@nestjs/*`, `drizzle-orm` ni `postgres`.
- `AppModule` **no** cablea órdenes (correcto para esta tarea; el composition root llega en la tarea 2).
- No hay adaptador HTTP ni tablas `order*` en Postgres.
- Web intacta: home con «Administrar menú»; sin enlaces de comanda todavía.

| Frente | Resultado | Nota |
|--------|-----------|------|
| C Código | Pasó | `env -u DATABASE_URL pnpm --filter @restaurante/api test`: 27 archivos, **177 pruebas**, 8 skipped (P1–P8 menú). Typecheck API y web limpios. Web: 2 archivos, 14 pruebas. Capas hexagonales OK. |
| T Integración | Pasó (regresión menú/plataforma) | `select 1` = 1. Tablas: `menu_items`, `menu_item_modifiers`, `menu_item_ingredients`. **Cero** tablas `order*`. `test:db` con `DATABASE_URL` de `.env`: 8 pruebas P1–P8. Health y health/database: `{"status":"ok","service":"restaurante-api"}`. `GET /menu-items`: 5 platos. API con `DATABASE_URL` imposible no escuchó el puerto 3099. |
| T Sistema | Pasó | `pnpm dev:restart` dejó API y web online; Postgres ya estaba encendido. Home en `https://restaurante.localhost/` muestra «Sistema de Pedidos» y «Administrar menú». `/menu` responde 200. |
| M Madurez | Nivel 2 para la tarea 1 de comanda | Plan con cierre y fecha. Núcleo testeable sin navegador ni Postgres. RF2–RF3 no llegan a nivel 3 hasta API + pantalla (tareas 2 y 3). No se adelantó persistencia ni UI. |

### Huecos de esta corrida

1. `pnpm test:db` sin exportar `DATABASE_URL` falla al cargar el spec. Hay que cargar `apps/api/.env` (o exportarla) antes. No es un fallo del menú: con la URL, P1–P8 pasaron.
2. No hay endpoints ni tablas de órdenes. Es el alcance acordado de la tarea 1; la tarea 2 los construye.
3. El menú de demo sigue con 5 platos activos. No se tocaron.
4. No se apagó `postgresql-18` para probar el encendido en frío.

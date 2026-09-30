# Guía de pruebas CTTM

**Para qué sirve:** repetir las mismas pruebas cada vez que se cierre una tarea, o cada vez que el código nuevo llegue a 1000 líneas.  
**Fecha de esta corrida:** 30 de septiembre de 2026.  
**Alcance de la corrida:** todo el código de producto que existe hoy (tarea 1, base de datos y arranque).

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
- [ ] `http://localhost:3000/` muestra la home actual («Sistema de Pedidos»).
- [ ] `pnpm dev:stop` para API y web y deja Postgres encendido.
- [ ] Tras un cambio visible en `apps/web`, `pnpm dev:restart` antes de mirar el navegador.

```bash
pnpm dev:restart
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/
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

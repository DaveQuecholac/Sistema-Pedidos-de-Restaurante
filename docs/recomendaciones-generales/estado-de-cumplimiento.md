# Recomendaciones generales — estado en este repo

**Fecha:** 11 de noviembre de 2026  
**Sistema:** pedidos del restaurante (Menú, Salón, Órdenes, Pagos, gateway y web).  
**Arranque de todos los días:** `pnpm dev`.

Cinco recomendaciones ya corren en ese arranque. La sexta está descrita en `docker-compose.yml` y no se levantó aquí: esta máquina tiene Podman y no el plugin de Compose.

| Recomendación | Estado |
|---|---|
| API Gateway que centraliza la validación del JWT | Hecho |
| Cache-aside con Redis en al menos un servicio | Hecho, en Menú |
| TTL de tokens y de claves de caché | Hecho |
| OpenAPI/Swagger por API | Hecho en las APIs HTTP. Pagos, que solo habla gRPC, queda en un YAML |
| Pruebas unitarias y de integración por microservicio | Hecho en Menú, Salón, Órdenes y Pagos. El gateway prueba enrutado, login y token vencido |
| Docker y docker-compose (servicios + Redis + base de datos) | Archivo listo. Falta Compose en esta máquina para ejecutarlo |

El corte de negocio sigue en [documentacion-entrega-microservicios.md](../entrega-microservicios/documentacion-entrega-microservicios.md). Este documento solo registra el checklist.

## 1. JWT en el gateway

El gateway (`http://localhost:3000`) emite el token y lo valida antes de reenviar.

- `POST /auth/login` con `{ "role": "waiter" | "cashier" | "kitchen" }` devuelve `accessToken`, `tokenType: "Bearer"`, `expiresIn` y `role`.
- Menú, Salón y Órdenes exigen `Authorization: Bearer`. Sin token, o con un token vencido o firmado con otro secreto, la respuesta es 401 y el servicio de negocio no se llama.
- `GET /health`, `GET /docs` y `GET /openapi.json` no piden token.
- Pagos no pasa por el gateway: Órdenes lo llama por gRPC.

La web pide el token al elegir Mesero, Cobro o Cocina, lo guarda en la sesión y lo manda en cada llamada. El plano de mesas carga con ese token.

Secreto y duración salen de `JWT_SECRET` y `JWT_EXPIRES_IN` (por defecto `2h`). El valor de desarrollo está en `apps/gateway/.env.example` y en `ecosystem.config.cjs`.

## 2. Cache-aside en Menú

`ListMenuItems` pasa por `CachingMenuRepository`:

1. Lee la clave `menu:items` en Redis.
2. Si no está, lee Postgres y guarda el listado con `SET` y expiración.
3. Un alta, un cambio o una baja borra la clave. La siguiente lectura vuelve a la base.

El puerto es `MenuListCache`. El adaptador de producto es `RedisMenuListCache` (`REDIS_URL`, por defecto `redis://127.0.0.1:6379`). Las pruebas usan un doble en memoria.

`pnpm dev` enciende Redis (contenedor `restaurante-redis` con Podman o Docker) si el puerto 6379 no responde.

## 3. TTL

| Dato | Duración | Dónde |
|---|---|---|
| JWT del personal | 2 horas (`expiresIn: 7200`) | `JWT_EXPIRES_IN=2h` |
| Clave `menu:items` | 60 segundos | `MENU_CACHE_TTL_SECONDS=60` |

El token deja de valer cuando `exp` ya no es futuro. La clave de menú desaparece al cumplirse el TTL o al invalidarla una escritura.

## 4. OpenAPI

| API | Documento |
|---|---|
| Gateway | http://localhost:3000/docs y http://localhost:3000/openapi.json |
| Menú | http://localhost:3002/docs y http://localhost:3002/openapi.json |
| Salón | http://localhost:3003/docs y http://localhost:3003/openapi.json |
| Órdenes | http://localhost:3001/docs y http://localhost:3001/openapi.json |
| Pagos | `apps/payments/openapi.yaml` (Charge, Void, GetReceipt). No hay HTTP público |

El visor de Swagger se carga desde unpkg. El JSON del contrato lo sirve cada proceso.

## 5. Pruebas

Cada servicio de negocio tiene pruebas de dominio, de casos de uso y de Drizzle. El gateway añade las del token (duración, firma, vencimiento) y las del enrutado con y sin Bearer. Menú añade miss, hit, invalidación y vencimiento de `menu:items`.

Corrida de esta alineación: pruebas de `@restaurante/gateway`, `@restaurante/menu` y las del token en la web.

## 6. Compose

`docker-compose.yml` en la raíz describe un contenedor por proceso, a partir de `docker/Dockerfile`:

- `postgres` con las bases `menu`, `salon`, `restaurante` y `payments`
- `redis`
- `gateway`, `menu`, `salon`, `api` (Órdenes) y `payments`

Cada proceso aplica sus migraciones al arrancar. Comando previsto: `pnpm docker:up`. En esta máquina ese comando no corre todavía: hay Podman y no está el plugin de Compose ni `podman-compose`.

El día a día no depende de Compose. `pnpm dev` sigue levantando Postgres, Redis y los procesos con PM2.

---

# Qué cambia respecto a la entrega de microservicios

Texto para pegar al final de [documentacion-entrega-microservicios.md](../entrega-microservicios/documentacion-entrega-microservicios.md). El corte (cuatro servicios, hexágono, gRPC, cobro y reglas de cocina) no cambia. Esto es lo que se sumó el 11 de noviembre de 2026.

El gateway ya no solo enruta. Antes de reenviar a Menú, Salón u Órdenes exige `Authorization: Bearer`. `POST /auth/login` entrega el token del área (`waiter`, `cashier` o `kitchen`) y dura 2 horas. Sin token, o con uno vencido, responde 401 y no llama al servicio. Siguen públicos `/health`, `/docs` y `/openapi.json`. Pagos sigue fuera del gateway: Órdenes lo llama por gRPC.

La web pide ese token al elegir Mesero, Cobro o Cocina y lo manda en cada llamada. Las pantallas son las mismas.

El listado de platos usa cache-aside en Redis (clave `menu:items`, 60 segundos). Si no está, Menú lee Postgres y la guarda. Un alta, un cambio o una baja borra la clave. El precio de una comanda abierta sigue siendo el que se congeló en la línea; la caché no lo reescribe.

Cada API HTTP publica Swagger en `/docs` (gateway `:3000`, Menú `:3002`, Salón `:3003`, Órdenes `:3001`). Pagos no tiene HTTP: el contrato queda en `apps/payments/openapi.yaml`.

`pnpm dev` sigue siendo el arranque y ahora también enciende Redis. Hay además un `docker-compose.yml` con los servicios, Redis y una base por servicio (`pnpm docker:up`). En esta máquina ese comando aún no corre: falta el plugin de Compose.

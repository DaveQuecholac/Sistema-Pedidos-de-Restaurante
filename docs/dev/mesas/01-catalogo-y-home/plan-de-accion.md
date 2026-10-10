# Plan de acción — Catálogo de mesas (núcleo → API → Home + admin)

**Rama:** `dev/mesas` (acordar nombre git al implementar)  
**Fecha:** 10 de octubre de 2026  
**Estado:** Hecho (tareas 1–3 + docs/cierre). Checklist §10 en verde.  
**Análisis:** `analisis.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.  
**Regla de ritmo:** **un paso → pruebas de ese paso → OK → siguiente.** No saltar pruebas. Si una prueba falla, no se avanza.

## 1. Resultado final (las 3 tareas)

1. El local tiene un **catálogo real de mesas** (alta, edición de etiqueta/zona, desactivar/activar).  
2. `OpenOrder` con mesa exige: mesa existente, activa, y **sin** otra orden activa en esa mesa.  
3. Home Mesas lee la API (libre/ocupada/lista); el admin permite sumar o quitar mesas del piso.  
4. Pedido externo sigue igual. RF3–RF5 intactos.

Seed: **6 mesas** iniciales (`"1"`…`"6"`, zona `"Salón"`). Después el usuario decide el resto.

## 2. No se toca

- Lógica de cocina, totales y cobro (salvo validación en `OpenOrder`).  
- Auth, microservicios, pasarelas reales.  
- Hard-delete de mesas con historial.  
- Redesign global del shell (solo Home + admin mesas + cliente API).

Archivo fuera de las secciones 5–6 → listar y acordar antes.

## 3. Decisiones cerradas

| Tema | Decisión |
|------|----------|
| Entidad | `Table`: `id`, `label`, `zone`, `active` |
| Id | Negocio 1–40, trim, único; lo elige el usuario al crear |
| Quitar | `DeactivateTable` (como menú). Bloqueado si hay orden activa |
| Agregar | `CreateTable` vía API + UI admin |
| Ocupación | Derivada de órdenes activas; sin columna `occupied` |
| Una activa | Sí → `TableAlreadyHasActiveOrderError` |
| Seed | 6 mesas; idempotente (no duplicar si ya existen) |
| Errores | Clases `name` propio; mensaje dominio en inglés; HTTP mapea código |
| Drizzle | Solo `db:generate` / `db:migrate` |
| Pruebas | Obligatorias tras **cada** paso de este plan |

## 4. Contrato

### 4.1 Dominio / puerto

```ts
class Table {
  static create(input: { id: string; label: string; zone: string }): Table; // active true
  static restore(input: { id; label; zone; active }): Table;
  rename(label: string): Table;
  setZone(zone: string): Table;
  deactivate(): Table;
  activate(): Table;
}

interface TableRepository {
  add(table: Table): Promise<void>;
  save(table: Table): Promise<void>;
  findById(id: string): Promise<Table | null>;
  list(): Promise<Table[]>;
}

// OrderRepository: añadir findActiveByTableId(tableId) → Order | null
//   (activa = OPEN | SENT_TO_KITCHEN | IN_KITCHEN | READY)
```

### 4.2 Casos de uso

| Caso | Comportamiento clave |
|------|----------------------|
| `CreateTable` | Valida → `add`; id duplicado → `TableAlreadyExistsError` |
| `UpdateTable` | Label/zone; not found → error |
| `DeactivateTable` | Si `findActiveByTableId` → `TableHasActiveOrderError`; si ya inactiva, no-op seguro |
| `ActivateTable` | `active: true` |
| `ListTables` / `GetTable` | Listado / uno |
| `OpenOrder` | Si `tableId`: load table → not found / inactive → error; si hay activa → `TableAlreadyHasActiveOrderError`; si no, abrir como hoy. Externo sin cambios |

### 4.3 HTTP (producto)

| Método | Ruta | Notas |
|--------|------|-------|
| `GET` | `/tables` | Lista (activas e inactivas; UI filtra piso vs admin) |
| `GET` | `/tables/:tableId` | Una |
| `POST` | `/tables` | Body `{ id, label, zone? }` — zone default `"Salón"` |
| `PATCH` | `/tables/:tableId` | `{ label?, zone?, active? }` o rutas dedicadas deactivate |
| `POST` | `/tables/:tableId/deactivate` | Como menú |
| `POST` | `/orders` | Códigos nuevos: `TableNotFoundError`, `TableInactiveError`, `TableAlreadyHasActiveOrderError` |

UI:

- `/` — Home servicio (solo activas + ocupación).  
- `/mesas/admin` (o sección en Mesas) — CRUD lite: alta, editar, desactivar/activar.

## 5. Archivos orientativos

```text
apps/api/src/domain/table/
apps/api/src/application/table/
apps/api/src/application/ports/table-repository.ts
apps/api/src/application/order/open-order.ts          # ajuste
apps/api/src/application/ports/order-repository.ts    # findActiveByTableId
apps/api/src/infrastructure/.../drizzle-table-repository.ts
apps/api/src/infrastructure/persistence/drizzle/schema/… tables
apps/api/src/interface/http/... table controller + Zod
scripts/… o ensure seed mesas (ops, no en casos de uso)
apps/web/app/mesas/mesas-api.ts
apps/web/app/mesas/mesas-screen.tsx                   # Home real
apps/web/app/mesas/mesas-admin-screen.tsx             # admin
```

---

## 6. Pasos — Tarea 1 (núcleo). Probar tras cada paso

> Criterio Gen 1: todo con fake, **sin** Postgres ni browser.

### Paso 1.1 — Dominio `Table` + errores

- Crear `Table`, validaciones id/label/zone, `create` / `restore` / `deactivate` / `activate` / rename / setZone.  
- Errores de dominio de la §5 del análisis (los de entidad).

**Prueba (obligatoria):** Vitest dominio — id inválido, label vacío, deactivate/activate, restore fiel.  
**OK →** 1.2.

### Paso 1.2 — Puerto + `InMemoryTableRepository`

- Interface `TableRepository`; doble en memoria (copias, `add`/`save` como menú).

**Prueba:** add duplicado falla; save inexistente falla; list/find.  
**OK →** 1.3.

### Paso 1.3 — Casos de catálogo

- `CreateTable`, `UpdateTable`, `DeactivateTable`, `ActivateTable`, `ListTables`, `GetTable`.

**Prueba:** matriz de errores de aplicación (`TableAlreadyExists`, `TableNotFound`, …) sin HTTP.  
**OK →** 1.4.

### Paso 1.4 — `findActiveByTableId` en puerto de órdenes + fake

- Extender `OrderRepository` e implementación en memoria de tests.

**Prueba:** fake devuelve la activa correcta / null.  
**OK →** 1.5.

### Paso 1.5 — Ajuste `OpenOrder`

- Inyectar `TableRepository` (+ uso de `findActiveByTableId`).  
- Mesa inexistente / inactiva / ya ocupada → errores.  
- Externo sin cambios (specs previos siguen verdes).

**Prueba:** suite `OpenOrder` ampliada + regresión externo; `pnpm --filter @restaurante/api test` (o el scope de order/table) en verde.  
**OK →** documentar cierre tarea 1; pasar a tarea 2 (nueva carpeta `02-…` con su plan, o continuar aquí si se acuerda un solo doc).

---

## 7. Pasos — Tarea 2 (persistencia + API). Probar tras cada paso

### Paso 2.1 — Schema Drizzle `tables`

- Columnas: `id` PK text, `label`, `zone`, `active`, timestamps si el resto del schema los usa.  
- `db:generate` → `db:migrate` → verificar tabla en Postgres.

**Prueba:** `\d tables` / query SQL; journal Kit intacto (no editar a mano).  
**OK →** 2.2.

### Paso 2.2 — `DrizzleTableRepository` + mapper

**Prueba:** test de integración en transacción (mismo estilo menú/comanda): add/list/save/deactivate.  
**OK →** 2.3.

### Paso 2.3 — `findActiveByTableId` en `DrizzleOrderRepository`

**Prueba:** integración: orden OPEN en mesa X se encuentra; CLOSED no.  
**OK →** 2.4.

### Paso 2.4 — Seed idempotente 6 mesas

- Script ops o ensure en arranque documentado; **no** dentro del caso de uso.
- Hecho: `scripts/ensure-salon-tables.mjs` (`pnpm db:ensure-tables`); también en `pnpm dev` / `dev:restart`.

**Prueba:** correr seed dos veces → siguen 6 filas, sin duplicar.  
**OK →** 2.5.

### Paso 2.5 — HTTP Zod + `TableController` + cableado Nest

- Composition root elige `DrizzleTableRepository`.  
- Endpoints §4.3.

**Prueba curl / integración HTTP:**

| ID | Llamada | Esperado |
|----|---------|----------|
| H1 | `GET /tables` | 200, ≥ 6 tras seed |
| H2 | `POST /tables` `{ id:"7", label:"7" }` | 201 |
| H3 | `POST /tables` id duplicado | 409 `TableAlreadyExistsError` |
| H4 | `POST /tables/:id/deactivate` con orden activa | 409 `TableHasActiveOrderError` |
| H5 | `POST /orders` `{ tableId:"999" }` | 404/409 `TableNotFoundError` |
| H6 | Dos `POST /orders` misma mesa activa | segunda → `TableAlreadyHasActiveOrderError` |
| H7 | `POST /orders` `{ externalOrderId:"PL-1" }` | 201 (sin Table) |

**OK →** tarea 3.

---

## 8. Pasos — Tarea 3 (web Home + admin). Probar tras cada paso

### Paso 3.1 — `mesas-api.ts` (cliente real, sin fallbacks mock)

**Prueba:** Vitest del cliente (mismo estilo `order-api.spec`) o typecheck + llamada real en smoke.  
**OK →** 3.2.

### Paso 3.2 — Home Mesas desde API

- Quitar `FLOORS` hardcodeado.  
- Solo mesas `active`; ocupación vía `listOrders`.  
- Inspector: Abrir / Ver comanda (comportamiento actual).

**Prueba:** `pnpm --filter @restaurante/web typecheck` + `pnpm dev:restart` + smoke: se ven las del seed; Abrir mesa 1 crea orden y pasa a ocupada.  
**OK →** 3.3.

### Paso 3.3 — Admin UI mesas

- Alta (id, label, zone).  
- Editar label/zone.  
- Desactivar (error visible si hay orden activa).  
- Activar.  
- Inspector a la derecha al seleccionar (mismo patrón shell).

**Prueba browser:**

| ID | Flujo |
|----|--------|
| U1 | Crear mesa `8` → aparece en Home |
| U2 | Desactivar mesa libre → desaparece del piso de servicio |
| U3 | Desactivar con orden activa → mensaje de error; mesa sigue |
| U4 | Activar de nuevo → vuelve al Home |
| U5 | Flujo salón: libre → orden → cocina → lista → pago → cerrar → libre |
| U6 | Pedido externo desde Nueva orden sigue OK |

**OK →** 3.4.

### Paso 3.4 — Docs y cierre

- Actualizar `docs/dev/comanda/01-orden-y-cocina/` (una activa).  
- `docs/dev/mesas/cierre-del-modulo.md` en lenguaje del local.  
- Marcar hecho en este plan.

**Prueba:** checklist §10 en verde.

---

## 9. Catálogo de pruebas (resumen cruzado)

| ID | Capa | Qué |
|----|------|-----|
| D1–Dn | Dominio | Validación Table |
| A1–An | Application | CRUD + OpenOrder + errores |
| P1–Pn | Persistencia | Repo + findActiveByTableId + seed |
| H1–H7 | HTTP | §7 paso 2.5 |
| U1–U6 | UI | §8 paso 3.3 |

Comando habitual tras pasos de API: tests del package api.  
Tras web: `pnpm --filter @restaurante/web typecheck && pnpm --filter @restaurante/web test` + smoke con `pnpm dev:restart` (refresh solo no basta — Gen 1).

## 10. Hecho cuando

- [x] Análisis §11 con admin UI acordado.  
- [x] Tarea 1: Vitest núcleo en verde; cero Nest/Drizzle/Next en `domain/`.  
- [x] Tarea 2: migrate aplicada; H1–H7 OK.  
- [x] Tarea 3: U1–U6 OK; Home sin hardcode.  
- [x] Docs comanda sin drift “varias activas”.  
- [x] Cierre del módulo escrito.  
- [x] `docs/README.md` enlaza esta carpeta.

## 11. Riesgos / stop-the-line

| Riesgo | Parada |
|--------|--------|
| Avanzar sin prueba del paso | Prohibido por este plan |
| Columna `occupied` | No; ocupación = órdenes |
| Validar mesa solo en React | No; `OpenOrder` manda |
| Hardcode 1–6 en Home tras API real | Viola mock→real |
| Desactivar con comanda abierta | Debe fallar con error claro |
| Editar SQL/journal a mano | Viola Drizzle Gen 1 |

## 12. Orden de ejecución al implementar

1. Pedir OK de Hector para **empezar código** (docs ya acordados).  
2. Ejecutar §6 paso a paso.  
3. Abrir `docs/dev/mesas/02-persistencia-y-api/` (analisis+plan cortos que **enlazan** este contrato; no duplicar párrafos).  
4. Idem `03-pantalla-home-y-admin/`.  
5. Demo final del resultado §1.

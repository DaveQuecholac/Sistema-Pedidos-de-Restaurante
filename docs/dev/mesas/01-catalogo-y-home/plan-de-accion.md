# Plan de acción — Catálogo de mesas y Home con sentido

**Rama:** `dev/mesas` (acordar nombre de rama git al implementar)  
**Fecha:** 10 de octubre de 2026  
**Estado:** acordado el 10 de octubre de 2026 (análisis §11). Listo para implementar cuando Hector lo pida.  
**Análisis:** `analisis.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Resultado deseado

En el local se entienden dos cosas distintas:

1. **Mesas** — lugares del restaurante (catálogo).
2. **Órdenes** — comandas que pueden estar ligadas a una mesa.

La pestaña principal **Mesas** muestra el catálogo real. Una mesa libre abre comanda; una ocupada entra a la orden activa. El flujo de siempre sigue igual: líneas → cocina → cuenta → cobro.

Se prueba el núcleo sin browser; la API sin UI; el Home con `pnpm dev:restart` y recorrido en `https://restaurante.localhost`.

## 2. No se toca (salvo el ajuste explícito de OpenOrder)

- Reglas RF3/RF4/RF5 de cocina, totales y cobro (salvo validación de mesa al abrir).
- Pasarelas reales, auth, microservicios.
- Redesign completo del shell (solo sustituir datos del Home / admin mesas).
- Pedidos externos: siguen sin catálogo de mesas.

Si al implementar hace falta un archivo fuera de las secciones 5–6, se lista y se acuerda antes.

## 3. Decisiones cerradas para implementar

Valen las del análisis §11 (10 oct 2026):

| Tema | Decisión |
|------|----------|
| Entidad | `Table`: `id` `"1"`…`"6"`, `label` acorde, `zone` fija un piso (ej. `"Salón"`), `active` |
| Cantidad | **6 mesas** fijas vía seed/ops — no UI para generar N mesas |
| Puerto | `TableRepository` — sin SQL |
| Ocupación | Derivada de órdenes activas; no columna `occupied` |
| Activa | `OPEN`, `SENT_TO_KITCHEN`, `IN_KITCHEN`, `READY` |
| Una activa por mesa | Sí. Segunda apertura → `TableAlreadyHasActiveOrderError` |
| `OpenOrder` mesa | Exige mesa existente y `active`; luego regla de una activa |
| Externo | Sin cambio (`ExternalOrderIdInUseError` como hoy) |
| Home | Solo API; sin grid hardcodeado 1–12 |
| Admin UI | **No** en v1 |
| Errores | Clases `name` propio; mensaje dominio en inglés; HTTP/Zod en el borde |
| Drizzle | Solo `db:generate` / `db:migrate`; sin SQL a mano |

## 4. Contrato (borrador)

### 4.1 Dominio / aplicación

```ts
class Table {
  static create(input: { id: string; label: string; zone: string | null }): Table;
  static restore(input: { id; label; zone; active }): Table;
  rename(label: string): Table;
  setZone(zone: string | null): Table;
  deactivate(): Table;
  activate(): Table;
  // getters: id, label, zone, active
}

interface TableRepository {
  findById(id: string): Promise<Table | null>;
  list(): Promise<Table[]>;
  save(table: Table): Promise<void>;
}

// Casos: ListTables, GetTable
// Seed/ops escribe las 6 filas (fuera de casos de uso de producto)
// OpenOrder(tableId): load Table → not found / inactive → error;
//   list active orders for tableId → if any → error; else open as today
```

### 4.2 HTTP (vocabulario producto)

| Método | Ruta | Notas |
|--------|------|-------|
| `GET` | `/tables` | Lista las 6 mesas del catálogo |
| `POST` | `/orders` | Body `{ tableId }` o `{ externalOrderId }`; errores nuevos si mesa inválida / ya tiene orden activa |

Sin `POST/PATCH /tables` en v1 (el catálogo no se administra por API de producto).

UI web: `/` consume `GET /tables` + `GET /orders?status=…`. API en inglés de dominio (`Table`, `/tables`); UI en español.

### 4.3 Home (comportamiento)

| Estado mesa | Acción del clic |
|-------------|-----------------|
| Sin orden activa | `OpenOrder({ tableId })` → `/ordenes/:id` |
| Con orden activa (A) | Navegar a esa orden |
| Inactiva | No debería ocurrir en v1 (seed las deja activas); si aparece, no clicable |

Búsqueda del header: filtra por `label` / `id` (una sola zona).

## 5. Capas y archivos (orientativo)

### Tarea 1 — Núcleo

```text
apps/api/src/domain/table/
apps/api/src/application/table/
apps/api/src/application/order/open-order.ts   # solo inyección TableRepository + reglas nuevas
```

Tests Vitest con `InMemoryTableRepository` + fake de órdenes para “una activa”.

### Tarea 2 — Persistencia y API

```text
apps/api/src/infrastructure/persistence/drizzle/… tables schema
apps/api/src/infrastructure/…/drizzle-table-repository.ts
apps/api/src/interface/http/… table controller + Zod
apps/api/src/app.module.ts                    # composition root
```

Migración Kit. Seeds opcionales en `scripts/` (no en casos de uso).

### Tarea 3 — Web

```text
apps/web/app/mesas/mesas-screen.tsx           # datos reales (6 mesas)
apps/web/app/mesas/mesas-api.ts               # cliente HTTP
```

Quitar literales hardcodeados del Home. Mantener shell actual. Sin pantalla admin de mesas.

## 6. Pasos de implementación (cuando esté acordado)

1. Actualizar drift en `docs/dev/comanda/01-orden-y-cocina/` (ya no “varias activas por mesa”).  
2. Tarea 1: dominio + `ListTables` + ajuste `OpenOrder` + tests.  
3. Tarea 2: schema → migrate → seed 6 mesas → `GET /tables` → validación en `POST /orders`.  
4. Tarea 3: Home real → `pnpm typecheck` → `pnpm dev:restart` → smoke browser.  
5. Demo: mesas 1–6 → libre → orden → (flujo) → cerrar → mesa libre.  
6. Cierre del módulo (`docs/dev/mesas/cierre-del-modulo.md`) en lenguaje del local.

## 7. Catálogo de pruebas (mínimo)

| ID | Qué |
|----|-----|
| T1 | Seed/list: exactamente 6 mesas, zona única |
| T2 | `OpenOrder` con mesa inexistente → error |
| T3 | Segunda orden activa misma mesa → error |
| T4 | Tras `CLOSED`/`CANCELLED`, se puede abrir otra en esa mesa |
| T5 | Externo sigue igual |
| T6 | Home muestra las 6 de API; sin hardcode inventado |
| T7 | Smoke UI: mesa libre → comanda → mesa ocupada → cerrar → libre |

## 8. Hecho cuando

- [x] Análisis §11 acordado (Hector, 10 oct 2026).  
- [ ] Núcleo testeable con fake, sin Postgres/browser.  
- [ ] Cero imports de Nest/Drizzle/Next en `domain/`.  
- [ ] Home Mesas refleja 6 mesas + ocupación derivada.  
- [ ] Docs de comanda actualizados (una activa por mesa).  
- [x] `docs/README.md` enlaza esta carpeta.  
- [ ] Demo del resultado de la sección 1.

## 9. Por qué esto hace sentido la pestaña Mesas

| Sin catálogo (hoy) | Con este plan |
|--------------------|---------------|
| Mesas = botones inventados en React | Mesas = datos del negocio |
| Orden “parece” la mesa | Mesa es el lugar; orden es la cuenta de ese lugar |
| No hay alta/baja de mesas del local | El local administra su plano (aunque sea simple) |
| Ocupación ambigua si hay varias órdenes | (A) Libre/Ocupada es una sola verdad usable en un clic |

## 10. Riesgos / stop-the-line

- Implementar sin cerrar A vs B → Home contradictorio.  
- Guardar `occupied` en BD además de órdenes → drift de estado.  
- Validar mesa solo en React → se bypasea por API.  
- Copiar fallbacks del grid mock al path real → viola mock→real.

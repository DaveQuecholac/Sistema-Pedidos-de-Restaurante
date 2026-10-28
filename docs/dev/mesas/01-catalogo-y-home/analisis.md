# Análisis — Catálogo de mesas, Home y administración

**Rama:** `dev/mesas` (o la rama de frontend vigente, si se unifica)  
**Alcance:** ampliación Gen 1 sobre RF2 (mesa física como catálogo + una orden activa por mesa)  
**Fecha:** 10 de octubre de 2026  
**Estado:** implementado (10 oct 2026). Cierre: `docs/dev/mesas/cierre-del-modulo.md`.  
**Plan:** `plan-de-accion.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc` (+ `docs/desarrollo/dev-spec-gen1.md`).

## 1. Por qué este análisis

RF2 pide abrir una comanda vinculada a una **mesa física** o a un **id externo**. El origen `tableId` / `externalOrderId` ya existe en el núcleo, pero **no hay catálogo de mesas**: el Home inventa botones en React. Eso no respalda el enunciado (“mesas en sala”) ni deja al local decidir cuántas mesas tiene.

Este módulo cierra ese hueco en hexagonal: entidad + puerto + API + Home real + **pantalla para agregar / quitar mesas**, sin tocar RF3–RF5.

## 2. Marco Gen 1 (no reabrir)

| Fuente | Qué manda |
|--------|-----------|
| `dev-spec-gen1.mdc` | Hexagonal; monolito; Nest/PG/Drizzle/Zod/Next; analizar → acordar → documentar/implementar |
| `arquitectura-hexagonal.mdc` | Núcleo sin UI/BD; puerto primero; composition root Nest |
| `limites-capas.mdc` | Vocabulario producto (`Table`, `tableId`); UI no calcula venta |
| `drizzle-y-layout.mdc` | Migraciones solo Kit; feature por módulo |
| `disciplina-implementacion.mdc` | Diff mínimo; mock→real sin arrastre; una preocupación por cambio |
| `patrones-diseno.mdc` | Repository + Use Case; sin event-bus/CQRS |

Pedido externo / para llevar / delivery: siguen siendo **`externalOrderId`**. No tercer origen.

## 3. Modelo

```text
Table (catálogo)     id / label / zone / active
      ▲
      │ tableId === Table.id
Order ──OrderOrigin.table(tableId)──► mesa debe existir y active
```

- **Ocupación:** derivada de órdenes en `{ OPEN, SENT_TO_KITCHEN, IN_KITCHEN, READY }`. Sin columna `occupied`.
- **Una orden activa por mesa** (reabre la decisión de comanda del 4 oct).
- **Quitar mesa:** como el menú → **desactivar** (`active: false`). No borrar filas si hay historial; no se ofrece en el piso de servicio. Se puede **reactivar**.
- **Agregar mesa:** el usuario elige `id` de negocio (1–40, único) + `label` + `zone` (default `"Salón"`).

## 4. Alcance

### Entra

1. `Table` + `TableRepository` + casos: listar, obtener, crear, actualizar label/zone, desactivar, activar.  
2. Ajuste `OpenOrder`: mesa existe + activa + no hay otra orden activa en esa mesa.  
3. Drizzle + `GET/POST/PATCH` (+ deactivate) `/tables`.  
4. Seed inicial de **6 mesas** (punto de partida; el local puede sumar o desactivar).  
5. Home Mesas desde API (inspector actual se mantiene).  
6. **UI admin de mesas** (agregar / editar etiqueta-zona / desactivar / activar), estilo menú lite.  
7. Actualizar drift en docs de comanda (“una activa”).  
8. Pruebas por paso (Vitest → migrate/curl → browser).

### No entra

- Plano gráfico, juntar/transferir mesas, reservas.  
- Hard-delete de mesa con historial de órdenes.  
- Auth, microservicios, delivery real, pasarelas reales.  
- Cambiar RF3/RF4/RF5.

## 5. Errores (dominio / aplicación)

| Error (`name`) | Cuándo |
|----------------|--------|
| `InvalidTableIdError` | id vacío, fuera de 1–40, o inválido tras trim |
| `InvalidTableLabelError` | label vacío tras trim |
| `TableAlreadyExistsError` | `CreateTable` con id ya usado |
| `TableNotFoundError` | get/update/deactivate/activate / `OpenOrder` con id inexistente |
| `TableInactiveError` | `OpenOrder` (o uso de servicio) sobre mesa `active: false` |
| `TableAlreadyHasActiveOrderError` | segunda orden activa en la misma mesa |
| `TableHasActiveOrderError` | desactivar mesa que aún tiene orden activa |

Mensajes de dominio en **inglés** fijo; HTTP/Zod en el borde; UI en español.

## 6. Casos de uso

| Caso | Rol |
|------|-----|
| `ListTables` / `GetTable` | Home + admin + validación |
| `CreateTable` | Alta (admin) |
| `UpdateTable` | Label / zone (admin) |
| `DeactivateTable` / `ActivateTable` | Quitar / devolver al piso |
| `OpenOrder` (ajuste) | Validaciones de mesa + una activa |
| `ListOrders` (existente) | Ocupación en Home |

## 7. Capas

| Capa | Qué |
|------|-----|
| `domain/table/` | `Table`, errores |
| `application/table/` + ports | Casos + `TableRepository` |
| `application/order/OpenOrder` | Inyecta `TableRepository` (+ consulta órdenes activas por mesa) |
| `infrastructure/.../drizzle` | Schema `tables`, repo, seed |
| `interface/http` | Zod + `TableController` |
| `apps/web` | Home real + admin mesas; sin lógica de venta |

## 8. Mapa de tareas (3 cortes; cada uno con pruebas)

| Tarea | Carpeta | Entrega | Prueba al cerrar el paso |
|-------|---------|---------|--------------------------|
| 1 | Esta (`01-catalogo-y-home`) | Dominio + casos + fake + `OpenOrder` ajustado | Vitest API, sin Postgres |
| 2 | `02-persistencia-y-api/` | Drizzle, migrate, seed 6, REST tables + errores en `POST /orders` | Vitest integración + curl |
| 3 | `03-pantalla-home-y-admin/` | Home API + admin UI | `pnpm typecheck`, `dev:restart`, smoke browser |

El detalle de **pasos atómicos y pruebas tras cada uno** vive en `plan-de-accion.md`.

## 9. Frontend hoy → después

| Hoy | Después |
|-----|---------|
| Grid hardcodeado | `GET /tables` |
| Sin alta/baja | Admin: crear / desactivar / activar |
| Inspector mesa | Igual patrón; datos reales |

## 10. Relación con RF1–RF5

| RF | Backend hoy | Este módulo |
|----|-------------|-------------|
| RF1 Menú | Hecho | No |
| RF2 Mesa / externo | Parcial (falta catálogo + una activa) | **Sí** |
| RF3–RF5 | Hechos | No |

Para llevar / delivery = `externalOrderId` (ya hecho).

## 11. Decisiones confirmadas (Hector)

| # | Acuerdo | Fecha |
|---|---------|-------|
| 1 | Ampliar Gen 1 con catálogo de mesas | 10 oct 2026 |
| 2 | Una orden activa por mesa | 10 oct 2026 |
| 3 | **Admin UI: sí** — el usuario puede **agregar** y **quitar** (desactivar) mesas | 10 oct 2026 (actualización) |
| 4 | Id de negocio elegido al crear (1–40), no UUID interno | 10 oct 2026 |
| 5 | Un piso/zona por defecto (`"Salón"`); el admin puede editar `zone`/`label` | 10 oct 2026 |
| 6 | Seed inicial 6 mesas como punto de partida | 10 oct 2026 |
| 7 | Plan por pasos con **prueba obligatoria tras cada paso** | 10 oct 2026 |

## 12. Qué hereda la implementación

- Maestro Gen 1: checklist hexagonal (fake sin Postgres; cero framework en domain; Nest elige adaptador).  
- Drizzle solo Kit.  
- Mock→real: Home/admin no copian fallbacks del grid inventado.  
- Actualizar `docs/dev/comanda/01-orden-y-cocina/` al implementar (una activa).  
- Cierre del módulo en `docs/dev/mesas/cierre-del-modulo.md` al terminar la tarea 3.

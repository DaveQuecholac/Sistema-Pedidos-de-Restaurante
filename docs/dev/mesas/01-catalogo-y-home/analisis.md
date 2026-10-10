# Análisis — Catálogo de mesas y Home que tiene sentido

**Rama:** `dev/mesas` (o la rama de frontend vigente, si se acuerda unificar)  
**Alcance:** ampliación acordable sobre Gen 1 (RF2 ya entregado; el catálogo de mesas **no** estaba en Gen 1)  
**Fecha:** 10 de octubre de 2026  
**Estado:** acordado el 10 de octubre de 2026 (sección 11). No cambia código hasta implementar.  
**Plan:** `plan-de-accion.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Por qué este análisis

En la UI actual la pestaña principal es **Mesas**, pero el núcleo **no** tiene catálogo de mesas. El Home dibuja un grid fijo (1–12) y llama a `OpenOrder({ tableId })`. Eso cumple el look del brief de frontend, pero **no** explica el producto: “¿la mesa es una entidad o solo un texto en la orden?”.

Este documento revisa cómo ya trabajamos (rules, patrones, docs), qué dice Gen 1 sobre mesa/orden, y propone un diseño hexagonal para que **tener Mesas en la pestaña principal tenga sentido**.

## 2. Cómo estamos trabajando (marco vigente)

### 2.1 Cursor rules / maestro

| Fuente | Qué manda aquí |
|--------|----------------|
| `dev-spec-gen1.mdc` + `docs/desarrollo/dev-spec-gen1.md` | Hexagonal; monolito; stack TS/Nest/PG/Drizzle/Zod/Next; RF1–RF5; flujo analizar → acordar → documentar/implementar |
| `arquitectura-hexagonal.mdc` + `docs/documentacion-inicial/arquitectura-hexagonal.md` | Núcleo sin UI/BD; puertos en lenguaje de dominio; adaptadores driven/driving; composition root Nest |
| `limites-capas.mdc` | UI no calcula venta; vocabulario producto (`tableId`, `Order`); mapeo fila↔producto solo en infra |
| `patrones-diseno.mdc` + `analisis-patrones-diseno.md` | Pocos patrones: Aggregate, State, Strategy, Money, Repository, Adapter, Use Case. Solo si resuelven un RF o un puerto |
| `drizzle-y-layout.mdc` | Feature por módulo; migraciones solo con Kit; sin `ALTER` ad-hoc |
| `disciplina-implementacion.mdc` | Diff mínimo; mock→real sin arrastre; docs al día o reportar drift |
| `documentacion.mdc` | Español; `docs/<carpeta>/`; no `.md` sueltos en `docs/` |

Precedencia: decisiones cerradas de **este** repo → maestro → docs Gen 1 / hexagonal → hábito externo.

### 2.2 Patrones que aplican a mesas

| Patrón | Uso propuesto |
|--------|----------------|
| Domain Model | `Table` como entidad de catálogo (no agregado de venta) |
| Repository | Puerto `TableRepository` |
| Use Case + DI | Listar / crear / actualizar / desactivar; validar mesa al abrir orden |
| Adapter | Drizzle + REST Zod + Next Home |
| Aggregate `Order` | **Sin** absorber el catálogo: sigue siendo la comanda; solo referencia `tableId` |

No hace falta State ni Strategy en mesas. No event-bus, no CQRS.

### 2.3 Docs de desarrollo ya existentes

| Módulo | Qué dejó cerrado sobre “mesa” |
|--------|-------------------------------|
| `docs/dev/comanda/01-orden-y-cocina/` | `OrderOrigin.table(tableId)` = texto libre 1–40. **Sin catálogo.** Varias comandas vivas por mesa. Sin “mesa ocupada”. |
| `docs/dev/comanda/02` y `03` | “Catálogo de mesas” en **No entra** |
| Propuesta / RF2 | Un `OpenOrder`; origen mesa o externo es **dato de canal**, no lógica distinta |
| Sprint plan | “Comandas / mesas” = abrir por mesa, no CRUD de plano |

Conclusión de la documentación **hasta ahora**: mesa ≠ entidad; mesa = etiqueta en la orden.

## 3. Modelo actual (sencillo)

```text
Hoy:
  Orden ──origin──► tableId "5"   (string libre)
                └─► o externalOrderId "UBER-1"

  No existe: Table, plano, ocupación en BD.
```

- La **orden** es la comanda (líneas, cocina, cuenta, cobro).
- La **mesa** en backend es solo “esta comanda dice ser de la mesa 5”.
- El Home UI inventa mesas 1–12 y las usa como botones de `OpenOrder`.

Por eso la pestaña Mesas **se siente de más** si el catálogo no existe: parece un módulo que el núcleo no respalda.

## 4. Qué haría que Mesas tenga sentido

Idea en una frase:

> **Mesa** = lugar del local (existe aunque no haya comanda).  
> **Orden** = comanda abierta/cerrada de ese lugar (o de un canal externo).  
> La pestaña Mesas muestra el local y te mete en la comanda activa (o abre una).

```text
Propuesto:
  Table (catálogo)  id / label / zone? / active
        ▲
        │ tableId (mismo string de origen)
        │
  Order ──OrderOrigin.table(tableId)──► debe existir y estar activa
```

La ocupación **no** se guarda en la mesa: se **deduce** de órdenes en estados activos (`OPEN` … `READY`). Así no hay dos verdades (mesa “ocupada” vs orden viva).

## 5. Alcance propuesto

### Entra (módulo Mesas)

1. Entidad `Table` + puerto `TableRepository` + casos de uso de catálogo (estilo menú lite).
2. Persistencia Drizzle + REST en vocabulario de producto.
3. Al `OpenOrder` con mesa: validar que el `tableId` exista y esté activo (regla de aplicación o dominio acordada).
4. Home Mesas: lista real desde API + cruce con órdenes activas (quitar grid hardcodeado).
5. Catálogo fijo de **6 mesas** en un solo piso/zona, cargado por seed/ops (sin pantalla admin para “generar cuántas mesas”).

### No entra (salvo acuerdo aparte)

- Pantalla admin para crear/editar/borrar mesas (“generar cuántas queremos”).
- Plano gráfico complejo, reserva de mesas, juntar mesas, transferir cuenta entre mesas.
- Varios pisos / más de 6 mesas en v1.
- Microservicios, auth, delivery real.
- Cambiar RF4/RF5 ni el State de cocina.
- Hacer que pedido externo dependa del catálogo de mesas.

## 6. Una orden activa por mesa (acordado)

En comanda (4 oct 2026) había quedado: varias comandas vivas por mesa. **Eso se reabre** (acuerdo 10 oct 2026):

| Regla | Efecto en Home |
|-------|----------------|
| **Una orden activa por mesa** | Libre → abrir; Ocupada → entrar a esa orden |

“Activa” = estado en `{ OPEN, SENT_TO_KITCHEN, IN_KITCHEN, READY }`.  
Cerrada o cancelada libera la mesa.

Al implementar: actualizar `docs/dev/comanda/01-orden-y-cocina/` para no dejar drift.

## 7. Modelo de dominio propuesto

Nombres de código en inglés.

| Tipo | Rol |
|------|-----|
| `Table` | `id` de negocio (`"1"`…`"6"`, es el `tableId` de origen), `label` (mismo número o texto corto), `zone` fija del local (un solo piso), `active` |
| `TableRepository` | `findById`, `list` (y `save` solo si el seed/ops lo necesita); sin SQL en el puerto |
| Relación con `Order` | Sigue `OrderOrigin.table(tableId)`. El id de mesa **es** el `tableId` |

Errores (clases con `name` propio, mensaje en inglés en dominio; HTTP mapea en el borde):

- `TableNotFoundError` / `TableInactiveError` al abrir orden con mesa inválida.
- `TableAlreadyHasActiveOrderError` al abrir segunda activa (opción A acordada).

## 8. Casos de uso

| Caso | RF / motivo |
|------|-------------|
| `ListTables` / `GetTable` | Home y validación; catálogo viene del seed |
| `OpenOrder` (ajuste) | Validar mesa activa + **una** orden activa por mesa |
| `ListOrders` (ya existe) | Home cruza ocupación; no inventar “ocupación” en BD |

No hay pantalla admin de mesas en v1. Alta del catálogo = script/seed ops (`scripts/`), no CRUD de producto en Next.

Controllers y pantallas solo disparan estos casos. El Home **no** calcula totales ni cocina.

## 9. Capas (Hexagonal)

| Capa | Qué toca |
|------|----------|
| `domain/table/` | `Table`, errores |
| `application/table/` | puertos + casos de uso |
| `application/order/OpenOrder` | validación contra `TableRepository` (inyectado) |
| `infrastructure/persistence/drizzle` | tabla `tables`, mapper, migraciones Kit |
| `interface/http` | Zod + controllers `Table` |
| `apps/web` | Home Mesas real (6 mesas del catálogo); sin admin de mesas; sin lógica de venta |

Orden de slice: dominio + tests → puerto + fake → Drizzle → HTTP → UI → cableado Nest.

## 10. Relación con el frontend ya hecho

| Hoy en web | Después de este módulo |
|------------|-------------------------|
| Grid fijo 1–12 en `mesas-screen` | `GET` catálogo + estados derivados |
| `openOrder({ tableId })` | Igual, pero el id viene del catálogo |
| Panel / Órdenes / Cocina / Pago | Sin cambio de flujo RF3–RF5 |

Drift actual a documentar: la pestaña Mesas es **UI-only** hasta implementar este plan. Ese drift se cierra con la tarea 3.

## 11. Decisiones confirmadas (Hector · 10 oct 2026)

| # | Pregunta | Acuerdo |
|---|----------|---------|
| 1 | Ampliar Gen 1 con catálogo de mesas | **Sí** |
| 2 | Órdenes activas por mesa | **Una** (opción A) |
| 3 | Admin de mesas en UI | **No.** No hace falta generar/editar cuántas mesas. Catálogo por **seed/ops**: 6 mesas fijas |
| 4 | Forma del `id` | **Id de negocio** `"1"`…`"6"` (es el `tableId` de origen). No UUID interno |
| 5 | Zona / pisos | **Un solo piso**; `zone` fija (ej. `"Salón"`). Seis mesas nada más |

Sobre el “admin”: lo que habría sido (alta de N mesas, renombrar, desactivar) **no entra**. El valor de Mesas en la pestaña principal es ver libre/ocupada y abrir o entrar a la comanda, no administrar el plano.

## 12. Mapa de tareas

Igual que menú/comanda, tres cortes verticales:

| Tarea | Carpeta (siguiente) | Entrega | Se prueba con |
|-------|---------------------|---------|---------------|
| 1 | Esta + núcleo | `Table`, puerto, `ListTables`, ajuste `OpenOrder`, fake repo | Vitest sin Postgres |
| 2 | `02-persistencia-y-api/` | Tabla Drizzle, seed 6 mesas, `GET /tables`, validación en `POST /orders` | Vitest + migrate + curl |
| 3 | `03-pantalla-home-y-demo/` | Home real con las 6 mesas (sin admin) | Browser + `pnpm dev:restart` |

Esta carpeta deja el contrato de producto; al implementar se sigue el `plan-de-accion.md`.

## 13. Qué hereda la implementación

- No reabrir Hexagonal, stack ni RF4/RF5.
- No calcular ocupación con columna mágica si las órdenes ya lo dicen.
- No dejar el Home hardcodeado cuando exista el puerto real (disciplina mock→real).
- Actualizar `docs/README.md` y, al cerrar el módulo, un `cierre-del-modulo.md` en lenguaje del local.
- Si el análisis de comanda §11 choca con la opción A: **actualizar** ese doc al implementar (no dejar drift).

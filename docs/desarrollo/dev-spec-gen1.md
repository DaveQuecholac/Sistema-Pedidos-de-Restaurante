# Dev Spec Gen 1
## Sistema de Pedidos de Restaurante — especificación normativa del repositorio

**Versión:** 1  
**Estado:** canónica para desarrollo en este repo  
**Precedencia:** si otra rule, hábito o ejemplo externo choca con este documento o con Hexagonal → **gana este repo**.

Este archivo es la **única especificación de repositorio** a citar para “cómo se trabaja aquí”. El detalle de Ports & Adapters vive en Hexagonal; Gen 1 lo amarra al layout, scripts, capas y disciplina diaria.

| Tema | Documento |
|------|-----------|
| **Este spec (repo / DX / capas operativas)** | `docs/desarrollo/dev-spec-gen1.md` |
| Arquitectura Ports & Adapters | `docs/documentacion-inicial/arquitectura-hexagonal.md` |
| RF, propuesta, stack, sprints | `docs/documentacion-inicial/` |
| Índice de docs | `docs/README.md` |

---

## 1. Decisiones cerradas (no reabrir)

| Nivel | Decisión |
|-------|----------|
| Diseño interno | **Arquitectura Hexagonal** (puertos y adaptadores); núcleo estilo Clean |
| Sistema | **Monolito modular**, un solo despliegue |
| Stack | TypeScript, NestJS, PostgreSQL + Drizzle, Zod, pnpm, Next.js + React |
| Cobros MVP | Adaptadores **simulados** detrás de `PaymentPort` |
| Alcance | RF1–RF5; sin microservicios, auth avanzada ni pasarelas reales |

---

## 2. Mapa del monorepo

```text
Restaurante/
  apps/
    api/     # NestJS — hexágono + adaptadores HTTP/BD/pago
    web/     # Next.js — adaptador driving (UI)
  docs/
    README.md
    documentacion-inicial/   # RF, propuesta, análisis, hexagonal, sprints
    desarrollo/              # este spec (Gen 1)
  scripts/                   # ops (PM2, etc.)
  ecosystem.config.cjs
  pnpm-workspace.yaml
```

### Capas en `apps/api` (obligatorio)

```text
apps/api/src/
  domain/           # reglas puras — sin Nest/Drizzle/HTTP
  application/      # use cases + puertos (interfaces)
  infrastructure/   # Drizzle, pagos fake, etc.
  interface/http/   # controllers + Zod
  main.ts / app.module.ts   # composition root
```

**Dirección de dependencias:** `adapters → application → domain` (nunca al revés).

### Módulos de producto (fronteras lógicas)

Menú · Órdenes · Cocina/estado · Cálculo · Pagos — colocalizar por feature; **no** carpetas globales `utils/` / `hooks/` / `zod/` que mezclen features.

---

## 3. Leyes Hexagonales (stop-the-line)

1. El núcleo (domain + application) funciona **sin** UI y **sin** BD.  
2. El núcleo **no conoce** Nest, Next, Drizzle, HTTP ni SDKs de pago.  
3. Toda dependencia externa entra por un **puerto**.  
4. Driving (Next, REST, tests) **llaman** use cases; driven (Drizzle, cobros) **implementan** puertos.  
5. Cableado concreto solo en el **composition root** (módulos Nest).  
6. API y UI hablan **vocabulario de producto** (`Order`, `MenuItem`, `tableId`…) — no nombres de tablas/ORM.

Checklist antes de dar por hecho un cambio de capas: ver `arquitectura-hexagonal.md` §10.

---

## 4. Stack y bordes

| Pieza | Rol |
|-------|-----|
| NestJS | API, DI, composition root |
| Zod | Validación **en el borde** HTTP; no calcula totales ni reglas de cocina |
| Drizzle + PostgreSQL | Adaptador driven de persistencia |
| Next/React | Adaptador driving; **muestra** lo que devolvió el núcleo |
| Money / Strategies | Cálculo y cobro en dominio/aplicación, no en la UI |

**Prohibido sin acuerdo:** tRPC/GraphQL como API principal, design systems pesados, microservicios.

**Config / env:** `process.env` solo en composition root o adaptadores de infra. Domain y use cases reciben dependencias por constructor (puertos / options), no leen env.

---

## 5. Desarrollo local (PM2)

Gestión unificada de **api** + **web** desde la **raíz** del repo.

| Comando | Efecto |
|---------|--------|
| `pnpm install` | Dependencias del workspace |
| **`pnpm dev`** | Arranca / registra procesos PM2 (api + web) |
| **`pnpm dev:stop`** | Detiene api + web |
| **`pnpm dev:restart`** | Reinicia api + web |
| **`pnpm dev:status`** | Lista procesos PM2 |
| **`pnpm dev:logs`** | Últimas líneas de logs |
| `pnpm dev:plain` | Dev **sin** PM2 (Nest/Next en paralelo en foreground) |
| `pnpm build` / `pnpm typecheck` | Build / typecheck de api + web |

| App PM2 | Puerto | Logs |
|---------|--------|------|
| `restaurante-api` | http://localhost:3001 | `logs/pm2/api-*.log` |
| `restaurante-web` | http://localhost:3000 | `logs/pm2/web-*.log` |

Implementación: `ecosystem.config.cjs` + `scripts/pm2-root.mjs`.

### Agente (Cursor) — ops

- Preferir **`pnpm dev` / `dev:restart` / `dev:stop` / `dev:status`** desde la raíz.  
- **No** dejar `pnpm dev:logs` ni `pnpm dev:plain` en follow indefinido como “arranque normal”.  
- Tras cambios **user-visible** en `apps/web`: correr **`pnpm dev:restart`** antes de pedir smoke; un refresh solo **no** garantiza proceso PM2 al día.  
- Diagnóstico: `logs/pm2/` o `pnpm dev:logs`.

---

## 6. Drizzle

Tras cambiar definiciones de tablas:

1. `db:generate` (Drizzle Kit)  
2. `db:migrate`  
3. Verificar columna/tabla en la BD  

**Prohibido:** SQL de migración a mano, editar `_journal.json` / snapshots a mano, `ALTER` ad-hoc como sustituto.

- Migraciones = **schema**, no seeds de demo/producto.  
- `NOT NULL` / FK con datos existentes: default o backfill seguro.  
- Scripts one-off / ensure: en `scripts/` o docs, no en casos de uso.

---

## 7. Disciplina de implementación

1. Solo lo pedido en el turno; diff mínimo.  
2. Una preocupación por cambio (dominio **o** API **o** UI), salvo flujo completo pedido.  
3. Antes de muchos archivos: listar y pedir OK si el alcance no estaba claro.  
4. Al tocar capas: indicar en chat dominio / application / adapter.  
5. Si no hay puerto para una tech nueva → **crear puerto primero**.  
6. Mock → real: sin arrastre de `||` / literales del mock en el path real; `null` es válido.  
7. Docs en `docs/<carpeta>/`; no `.md` sueltos en la raíz de `docs/` (salvo `README.md`).  
8. Si doc y código se contradicen: **parar**, reportar, acordar cuál manda.  
9. Commits solo si Hector lo pide.

---

## 8. Patrones (set mínimo)

Usar solo si resuelven un RF o un puerto:

Aggregate / State / Strategy / Money (VO) / Repository / Adapter / Use Case + DI / Factory si la creación lo pide.

**Evitar por ahora:** event-bus como base, CQRS, Singleton de dominio, Abstract Factory por costumbre.

Detalle: `docs/documentacion-inicial/analisis-patrones-diseno.md`.

---

## 9. Entrega por sprint (MVP)

Cada sprint = slice vertical **demoable** (dominio → API → UI). Plan y tarjetas Trello: `docs/documentacion-inicial/plan-sprints-trello.md`.

| Sprint | RF | Demo |
|--------|-----|------|
| 1 | RF1 | UI admin menú |
| 2 | RF2–RF3 | UI comanda + cocina |
| 3 | RF4 | UI desglose totales |
| 4 | RF5 | UI cobro + E2E |

---

## 10. Fuera de Gen 1 / fuera de MVP

No inventar ni cablear sin acuerdo: delivery de terceros, pasarelas reales, microservicios, auth avanzada, app móvil, Docusaurus/Storybook como parte del workspace, paquetes `lib/*` de dominio compartido prematuros.

---

## 11. Referencias Cursor (rules)

Las rules en `.cursor/rules/` **aplican** este spec; no lo sustituyen.

| Rule | Rol |
|------|-----|
| `dev-spec-gen1.mdc` | Cita este markdown; resumen operativo |
| `arquitectura-hexagonal.mdc` | Leyes Hexagonales |
| `limites-capas.mdc` | Dependencias y vocabulario de producto |
| `disciplina-implementacion.mdc` | Slices, mock→real, docs |
| `drizzle-y-layout.mdc` | Layout por módulo + migraciones |
| `api-nestjs.mdc` / `frontend-next.mdc` | Convenciones por glob |
| `proyecto-colaboracion.mdc` | Marco con Hector |
| `documentacion.mdc` | Organización de `docs/` |
| `patrones-diseno.mdc` | Set mínimo |

---

## 12. Quick reference

```bash
pnpm install
pnpm dev              # PM2: api + web
pnpm dev:restart      # tras cambios UI / proceso stale
pnpm dev:stop
pnpm dev:status
pnpm dev:logs
pnpm typecheck
pnpm build
```

**URLs:** Web http://localhost:3000 · API http://localhost:3001

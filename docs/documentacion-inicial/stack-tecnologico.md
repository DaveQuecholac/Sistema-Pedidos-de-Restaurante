# Stack tecnológico
## Sistema de Pedidos de Restaurante

**Fecha:** 17 de septiembre de 2026  
**Base:** decisiones de Hexagonal, monolito modular y patrones de diseño.  
**Enfoque:** stack TypeScript moderno, alineado al alcance académico / MVP.

---

## 1. Decisión

Se adopta un stack **TypeScript end-to-end**: un solo lenguaje en dominio, API y frontend, con herramientas que facilitan Hexagonal (DI, puertos tipados, persistencia desacoplable) sin sobrecarga operativa.

---

## 2. Stack adoptado

| # | Pieza | Tecnología | Rol |
|---|--------|------------|-----|
| 1 | Lenguaje | **TypeScript** | Dominio, aplicación, adaptadores y frontend tipados. |
| 2 | Backend / DI | **NestJS** | API, casos de uso, Strategy, Repository vía providers. |
| 3 | Persistencia | **PostgreSQL** + **Drizzle ORM** | Adaptador de salida de datos; SQL tipado. |
| 4 | Validación | **Zod** | Entradas de API y límites del hexágono. |
| 5 | Gestor de paquetes | **pnpm** | Instalación y scripts; repositorio simple. |
| 6 | Frontend | **Next.js** + **React** | Adaptador de entrada web (UI de menú, comandas, cobro). |

Complementos naturales (no son el núcleo, pero se usan con el stack):

- **REST** (controllers Nest) como contrato HTTP inicial.
- **Node.js 20+** como runtime.
- Adaptadores de cobro **simulados** (efectivo / tarjeta / pasarela fake) detrás del mismo puerto.

---

## 3. Justificación de cada pieza

| Tecnología | Motivo |
|------------|--------|
| TypeScript | Un solo lenguaje; buen soporte a Value Objects e interfaces de puertos. |
| NestJS | DI nativo ≈ Hexagonal (puertos como interfaces, adaptadores como providers). |
| Drizzle + PostgreSQL | Persistencia desacoplable; encaja con Repository; una sola BD al inicio. |
| Zod | Validar DTOs en el borde sin contaminar el dominio. |
| pnpm | Gestor rápido y predecible para el workspace del proyecto. |
| Next.js + React | UI web como adaptador driving; no concentra reglas de negocio. |

Fuera del stack base (se pueden valorar después si el curso lo pide):

- tRPC / GraphQL como API principal  
- Librerías UI pesadas o design systems de terceros  
- Auth avanzada, IA o almacenamiento de objetos  
- Orquestación compleja de procesos en desarrollo  

---

## 4. Encaje con la arquitectura ya decidida

```text
┌─────────────────────────────────────────────────────────┐
│  Next.js + React          ← adaptador de entrada (web)  │
└─────────────────────────────┬───────────────────────────┘
                              │ HTTP REST
┌─────────────────────────────▼───────────────────────────┐
│  NestJS                                                 │
│  Controllers → Use Cases → Dominio (Aggregate, State…)  │
│       ▲              │                                  │
│       │              ▼                                  │
│  Zod (borde)    Puertos (interfaces)                    │
│                      │                                  │
│         ┌────────────┼────────────┐                     │
│         ▼            ▼            ▼                     │
│   Drizzle+PG    Strategy cobro   (otros adaptadores)    │
└─────────────────────────────────────────────────────────┘
         ↑ un solo despliegue (monolito modular) ↑
```

| Decisión previa | Cómo la sostiene el stack |
|-----------------|---------------------------|
| Hexagonal | Nest modules: dominio puro + adapters `infra` / `http` / `payment`. |
| Monolito modular | Un proceso Nest (+ Next); módulos Menú, Órdenes, Cálculo, Pagos. |
| Despliegue único | Un backend + un frontend; una Postgres. |
| Strategy / Repository / DI | Providers Nest + interfaces TypeScript. |
| Cálculo determinista (RF4) | Lógica en dominio TS; dinero como Value Object, no en el UI. |

---

## 5. Mapeo a requisitos funcionales

| RF | Stack involucrado |
|----|-------------------|
| RF1 Menú | Nest use cases + Drizzle; pantallas Next para CRUD. |
| RF2 Abrir orden | API Nest; UI Next (mesa / ID externo). |
| RF3 Líneas y cocina | Reglas en dominio TS; Nest expone operaciones; UI refleja estado. |
| RF4 Cálculo | Dominio + tests; Zod solo valida input, no calcula. |
| RF5 Cobro | Strategies Nest (efectivo, tarjeta, pasarela simulada); UI elige medio. |

---

## 6. Estructura de repo sugerida

```text
Restaurante/
  docs/                 # por subcarpeta (ver docs/README.md)
  apps/
    api/                # NestJS (núcleo hexagonal + adaptadores)
    web/                # Next.js + React
  packages/             # opcional más adelante (shared types)
  pnpm-workspace.yaml   # si se usa apps/api + apps/web
```

Alternativa aún más simple al inicio: **un solo proyecto Nest** + **un Next** hermano, sin packages compartidos hasta que hagan falta.

Capas dentro de `apps/api` (orientativo):

```text
src/
  domain/           # entidades, value objects, reglas (sin Nest)
  application/      # casos de uso + puertos (interfaces)
  infrastructure/   # Drizzle, pagos fake, etc.
  interface/        # controllers HTTP, DTOs + Zod
```

---

## 7. Qué queda fuera del alcance inicial del stack

- Microservicios  
- tRPC / GraphQL  
- Múltiples bases de datos  
- Pasarelas de pago reales en producción  
- Auth avanzada (se puede añadir luego con un adaptador)  
- Contenedores obligatorios (Docker es opcional para Postgres local)

---

## 8. Conclusión

**Stack oficial del proyecto:**

1. **TypeScript**  
2. **NestJS**  
3. **PostgreSQL + Drizzle**  
4. **Zod**  
5. **pnpm**  
6. **Next.js + React** (frontend)

Stack acotado para implementar Hexagonal y cubrir RF1–RF5 sin sobrecarga operativa.

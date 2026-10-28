# Documentación — Sistema de Pedidos de Restaurante

La documentación **no vive suelta** en `docs/`. Cada tema o fase va en su **subcarpeta**.

## Convención

| Qué | Dónde |
|-----|--------|
| Índice y esta guía | `docs/README.md` |
| Docs de un tema / fase | `docs/<nombre-tema>/` |
| Análisis y plan de una tarea | `docs/<rama>/<tarea>/analisis.md` y `plan-de-accion.md` |
| Archivos sueltos en la raíz de `docs/` | **No** (salvo este README) |

Al crear documentación nueva: elegir o crear la subcarpeta que corresponda; no añadir `.md` directamente bajo `docs/`.

## Carpetas

| Carpeta | Contenido |
|---------|-----------|
| [`desarrollo/`](./desarrollo/) | **Dev Spec Gen 1** — cómo se trabaja en este repo |
| [`documentacion-inicial/`](./documentacion-inicial/) | Enunciado RF, análisis, propuesta, stack, hexagonal, plan de sprints/Trello |
| [`microservicios/`](./microservicios/) | Corte a microservicios (28 oct 2026): análisis completo y plan de acción general. Supera el despliegue único de septiembre |
| [`dev/plataforma/01-base-de-datos-y-arranque/`](./dev/plataforma/01-base-de-datos-y-arranque/) | Tarea 1 del Sprint 1: análisis y plan de base de datos y arranque |
| [`dev/menu/01-modelo-y-operaciones/`](./dev/menu/01-modelo-y-operaciones/) | Tarea 1 de la épica Menú: análisis y plan del modelo y las operaciones |
| [`dev/menu/02-persistencia-y-api/`](./dev/menu/02-persistencia-y-api/) | Tarea 2 de la épica Menú: análisis y plan de persistencia y API |
| [`dev/menu/03-pantalla-admin-y-demo/`](./dev/menu/03-pantalla-admin-y-demo/) | Tarea 3 de la épica Menú: análisis y plan de la pantalla admin y la demo |
| [`dev/menu/cierre-del-modulo.md`](./dev/menu/cierre-del-modulo.md) | Cierre del módulo de menú, en lenguaje del local |
| [`dev/comanda/01-orden-y-cocina/`](./dev/comanda/01-orden-y-cocina/) | Sprint 2, tarea 1: orden, líneas, estados de cocina y casos de uso en el núcleo |
| [`dev/comanda/02-persistencia-y-api/`](./dev/comanda/02-persistencia-y-api/) | Sprint 2, tarea 2: tablas de órdenes, repositorio Drizzle y API REST |
| [`dev/comanda/03-pantalla-comanda-y-demo/`](./dev/comanda/03-pantalla-comanda-y-demo/) | Sprint 2, tarea 3: pantallas de comandas y cocina con el estilo del menú, y demo |
| [`dev/comanda/cierre-del-modulo.md`](./dev/comanda/cierre-del-modulo.md) | Cierre del módulo de comanda/cocina, en lenguaje del local |
| [`dev/totales/01-calculo-en-el-nucleo/`](./dev/totales/01-calculo-en-el-nucleo/) | Sprint 3, tarea 1: dinero, descuento, propina, impuestos y cálculo de totales en el núcleo |
| [`dev/totales/02-persistencia-y-api/`](./dev/totales/02-persistencia-y-api/) | Sprint 3, tarea 2: descuento y propina guardados en la orden y API REST de totales |
| [`dev/totales/03-pantalla-cuenta-y-demo/`](./dev/totales/03-pantalla-cuenta-y-demo/) | Sprint 3, tarea 3: pantalla de cuenta con el desglose, y demo |
| [`dev/pagos/01-cobro-en-el-nucleo/`](./dev/pagos/01-cobro-en-el-nucleo/) | Sprint 4, tarea 1: pago, cierre `READY → CLOSED`, puerto de cobro y `CloseOrder` en el núcleo |
| [`dev/pagos/02-adaptadores-persistencia-y-api/`](./dev/pagos/02-adaptadores-persistencia-y-api/) | Sprint 4, tarea 2: simuladores de efectivo, tarjeta y pasarela; tabla de pagos y API de cierre |
| [`dev/pagos/03-pantalla-cobro-y-demo/`](./dev/pagos/03-pantalla-cobro-y-demo/) | Sprint 4, tarea 3: pantalla de cobro, pulido del recorrido y demo del MVP |
| [`dev/mesas/01-catalogo-y-home/`](./dev/mesas/01-catalogo-y-home/) | Ampliación Gen 1: catálogo de mesas, una activa, Home + **admin** alta/baja; plan por pasos con pruebas (acordado 10 oct 2026) |
| [`dev/mesas/cierre-del-modulo.md`](./dev/mesas/cierre-del-modulo.md) | Cierre del módulo de mesas, en lenguaje del local |

## Docs de trabajo por tarea

Cada tarea deja su propio par de archivos, dentro de la carpeta de la rama:

```text
docs/<rama>/<tarea>/analisis.md
docs/<rama>/<tarea>/plan-de-accion.md
```

Ejemplo: la tarea 1 en `dev/plataforma` está en `docs/dev/plataforma/01-base-de-datos-y-arranque/`. El plan se acuerda antes de implementar. El maestro de construcción sigue siendo `.cursor/rules/dev-spec-gen1.mdc`.

## Spec de repositorio

| Documento | Rol |
|-----------|-----|
| [**dev-spec-gen1.md**](./desarrollo/dev-spec-gen1.md) | Especificación larga Gen 1 (layout, Hexagonal, PM2, Drizzle, disciplina) |
| [**pruebas-cttm.md**](./desarrollo/pruebas-cttm.md) | Cómo probar código, integración, sistema y madurez, y el resultado de cada corrida |
| `.cursor/rules/dev-spec-gen1.mdc` | Maestro operativo: el archivo que se adjunta a un plan de acción |

## Índice — documentación inicial

| Documento | Rol |
|-----------|-----|
| [documentacion-inicial.md](./documentacion-inicial/documentacion-inicial.md) | Enunciado y RF1–RF5 |
| [propuesta-inicial.md](./documentacion-inicial/propuesta-inicial.md) | Propuesta consolidada |
| [analisis-arquitectura.md](./documentacion-inicial/analisis-arquitectura.md) | Decisión Hexagonal |
| [arquitectura-hexagonal.md](./documentacion-inicial/arquitectura-hexagonal.md) | Guía canónica Ports & Adapters |
| [analisis-estilo-sistema-despliegue.md](./documentacion-inicial/analisis-estilo-sistema-despliegue.md) | Gen 1: monolito modular + despliegue único (superado en el despliegue por el corte de microservicios) |
| [analisis-patrones-diseno.md](./documentacion-inicial/analisis-patrones-diseno.md) | Patrones mínimos |
| [stack-tecnologico.md](./documentacion-inicial/stack-tecnologico.md) | Stack oficial |
| [plan-sprints-trello.md](./documentacion-inicial/plan-sprints-trello.md) | Sprints + tarjetas copy-paste (Trello) |

## Índice — microservicios

El despliegue único de Gen 1 queda superado aquí. Hexagonal se mantiene dentro de cada servicio. El plan es general: cada fase, al implementarse, gana su propio par análisis + plan.

| Documento | Rol |
|-----------|-----|
| [analisis.md](./microservicios/analisis.md) | Corte a cuatro servicios, puertos, saga de cobro y datos |
| [plan-de-accion-general-corte-a-microservicios.md](./microservicios/plan-de-accion-general-corte-a-microservicios.md) | Plan general. Fases 1 a 5 en código. El corte de planes está completo. No hay fase 6 |
| [01-soltar-fk/analisis.md](./microservicios/01-soltar-fk/analisis.md) | Fase 1: quitar la FK de la línea al menú. Cerrada en código |
| [01-soltar-fk/plan-de-accion-fase-1-suelta-la-fk-de-la-linea.md](./microservicios/01-soltar-fk/plan-de-accion-fase-1-suelta-la-fk-de-la-linea.md) | Fase 1 por pasos. Cerrada. Migración `0011_talented_scorpion.sql` |
| [02-extraer-pagos/analisis.md](./microservicios/02-extraer-pagos/analisis.md) | Fase 2: el cargo sale a un proceso gRPC. Cerrada en código |
| [02-extraer-pagos/plan-de-accion-fase-2-extrae-pagos-por-grpc.md](./microservicios/02-extraer-pagos/plan-de-accion-fase-2-extrae-pagos-por-grpc.md) | Fase 2 por pasos. Cerrada. Migraciones `0012_late_tarantula.sql`, `0013_milky_magma.sql` y `0000_military_mac_gargan.sql` |
| [03-extraer-menu/analisis.md](./microservicios/03-extraer-menu/analisis.md) | Fase 3: el catálogo sale a su proceso. Cerrada en código |
| [03-extraer-menu/plan-de-accion-fase-3-extrae-el-menu.md](./microservicios/03-extraer-menu/plan-de-accion-fase-3-extrae-el-menu.md) | Fase 3 por pasos. Cerrada. Migraciones `0000_absurd_solo.sql` y `0014_real_infant_terrible.sql` |
| [04-salon-y-gateway/analisis.md](./microservicios/04-salon-y-gateway/analisis.md) | Fase 4: el plano sale a su proceso y la web entra por un solo gateway. Cerrada en código |
| [04-salon-y-gateway/plan-de-accion-fase-4-extrae-salon-y-el-gateway.md](./microservicios/04-salon-y-gateway/plan-de-accion-fase-4-extrae-salon-y-el-gateway.md) | Fase 4 por pasos. Cerrada. Migraciones `0000_naive_white_queen.sql` y `0015_eminent_earthquake.sql` |
| [05-evento-cocina/analisis.md](./microservicios/05-evento-cocina/analisis.md) | Fase 5: aviso `OrderSentToKitchen` con outbox. Cerrada en código |
| [05-evento-cocina/plan-de-accion-fase-5-publica-el-evento-de-cocina.md](./microservicios/05-evento-cocina/plan-de-accion-fase-5-publica-el-evento-de-cocina.md) | Fase 5 por pasos. Cerrada. Migración `0016_polite_payback.sql` |

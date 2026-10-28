# Plan de acción general — Microservicios
## Sistema de Pedidos de Restaurante

**Fecha:** 28 de octubre de 2026  
**Análisis:** `analisis.md` en esta carpeta. El corte, los cuatro servicios y gRPC están ahí (secciones 3, 5 y 6).  
**Estado:** plan general. Las fases 1 a 5 están cerradas en código. El corte de planes está completo. No hay fase 6.  
**Alcance:** orden, dependencia y el contenido obligatorio de cada plan. Este archivo no lista archivos de código ni mensajes `.proto`.

Para retomar el trabajo con el contexto perdido: leer este archivo entero y después `analisis.md`. No inventar un sexto plan, no engordar este documento con el detalle de una fase y no codear una fase cuyo plan todavía no exista.

Cada plan de fase se llama `plan-de-accion-fase-N-<qué-hace>.md`. El nombre del archivo dice la fase y el corte. No se usa un `plan-de-accion.md` genérico en esta carpeta. Los planes viejos de `docs/dev/` no se renombran.

No se salta una fase. El demo de piso (abrir, agregar línea, cocina, totales, cobrar) tiene que seguir funcionando al cerrar cada una.

---

## 1. Resultado del recorrido completo

Al terminar la fase 4, el mismo flujo de Gen 1 corre partido:

- La web habla REST con un gateway. El gateway enruta y no traduce a gRPC.
- Menú, Salón y Órdenes exponen REST hacia el gateway y gRPC hacia los otros servicios.
- Pagos solo escucha gRPC. No tiene ruta pública.
- Una línea guarda el precio capturado sin clave foránea al menú.
- Cerrar una orden es la saga del análisis (sección 7), con la misma anulación que ya existe si el cierre no se guarda.

La fase 5 añade el evento `OrderSentToKitchen`. Cerrada en código el 28 de octubre de 2026, migración `0016_polite_payback.sql`. El aviso no decide el total ni el cierre.

## 2. Los cinco planes que hay que escribir

La fase 0 es este par (`analisis.md` y este archivo) y ya está cerrada.

Cada plan vive junto a un análisis corto de esa fase. El análisis de la fase fija las decisiones del corte que esa fase toca. El plan es lo que se acuerda antes de codear. El análisis raíz no se copia.

| Fase | Carpeta | Plan | Depende de | Estado |
|------|---------|------|------------|--------|
| 1 | `01-soltar-fk/` | `plan-de-accion-fase-1-suelta-la-fk-de-la-linea.md` | Fase 0, hecha | Cerrada en código el 28 de octubre de 2026. Migración `0011_talented_scorpion.sql` |
| 2 | `02-extraer-pagos/` | `plan-de-accion-fase-2-extrae-pagos-por-grpc.md` | Fase 1 cerrada en código | Cerrada en código el 28 de octubre de 2026. Migraciones `0012_late_tarantula.sql`, `0013_milky_magma.sql` y `0000_military_mac_gargan.sql` |
| 3 | `03-extraer-menu/` | `plan-de-accion-fase-3-extrae-el-menu.md` | Fase 2 cerrada en código | Cerrada en código el 28 de octubre de 2026. Migraciones `0000_absurd_solo.sql` y `0014_real_infant_terrible.sql` |
| 4 | `04-salon-y-gateway/` | `plan-de-accion-fase-4-extrae-salon-y-el-gateway.md` | Fase 3 cerrada en código | Cerrada en código el 28 de octubre de 2026. Migraciones `0000_naive_white_queen.sql` y `0015_eminent_earthquake.sql` |
| 5 | `05-evento-cocina/` | `plan-de-accion-fase-5-publica-el-evento-de-cocina.md` | Fase 4 cerrada en código | Cerrada en código el 28 de octubre de 2026. Migración `0016_polite_payback.sql` |

Los cinco planes de fase ya están escritos y cerrados en código. El corte de planes está completo. No hay fase 6.

La fase 4 es un solo plan. Si al redactarlo el gateway no cabe junto con Salón, ese plan parte el trabajo en dos pasos. Siguen siendo la fase 4. No nace una fase 6.

## 3. Qué incluye cada plan, siempre

Todo plan de fase lleva estas siete partes, en este orden:

1. **Resultado.** Una frase con lo que queda funcionando, y la señal de la sección 4 hecha comprobable.
2. **Archivos.** Los que se crean o se tocan, y una lista corta de los que no.
3. **Capas.** Qué cambia en dominio, en application (puerto y caso de uso) y en el adaptador. Si una capa no se toca, decirlo.
4. **Contrato de la fase.** Solo lo que esa fase estrena: la migración, el `.proto` o la ruta REST. El texto del contrato va en el plan, no aquí.
5. **Prueba.** La que demuestra la señal, sin Postgres ni browser cuando la regla es de dominio, y con la base cuando la fase mueve tablas.
6. **Demo de piso.** Cómo se comprueba abrir, línea, cocina, totales y cobrar después del cambio.
7. **Fuera.** Lo que esta fase no hace, copiado del borde de la sección 4 y ajustado si el plan específico lo estrecha.

Además, el de la fase 1 resolvió cómo se anota en `.cursor/rules/dev-spec-gen1.mdc` y en `docs/desarrollo/dev-spec-gen1.md` que este corte manda a partir de ahí. Esos dos archivos se alinearon al cerrar la fase 1, no en este plan.

## 4. Qué tiene que poder ejecutar cada uno

El detalle fino sale al escribir el plan. Esto es lo que no puede faltar, para no perder el corte.

### Fase 1 — Soltar la FK

Sigue un solo proceso y una sola base. Migración con Drizzle Kit que quita `order_lines.menu_item_id` → `menu_items.id`. `menuItemId` sigue siendo el id del plato. Cerrada en código. El plan está en `01-soltar-fk/plan-de-accion-fase-1-suelta-la-fk-de-la-linea.md`.

**Señal:** agregar línea, cocina y cobro pasan sin esa FK.

**Fuera:** procesos nuevos, gateway, gRPC, `.proto`, mover tablas de pago.

### Fase 2 — Pagos

Cerrada en código. Órdenes sigue orquestando `CloseOrder` y `CloseTableAccount`. El adaptador de `PaymentPort` es un cliente gRPC. Efectivo, tarjeta y pasarela simulada viven en Pagos. `packages/contracts` tiene el primer `.proto` (cargo, resultado y void). Clave de idempotencia `orderId` o `sittingId`. La saga es la sección 7 del análisis. El REST de cerrar orden se queda en Órdenes, para la web. El plan por pasos, con las pruebas P2-1 a P2-9, está en `02-extraer-pagos/plan-de-accion-fase-2-extrae-pagos-por-grpc.md`.

**Señal:** un cobro simulado cruza de proceso. Si Órdenes no guarda el cierre, pide el void.

**Fuera:** extraer Menú o Salón, pasarela real, ruta REST pública de Pagos.

### Fase 3 — Menú

Cerrada en código. Menú se queda con el CRUD de platos y modificadores y con su base `menu`. Órdenes pide el snapshot por `MenuCatalog` (gRPC) y congela la línea como hoy. El `.proto` del snapshot se suma a `packages/contracts`. El admin de platos habla REST con Menú en el puerto 3002. La web de platos usa `NEXT_PUBLIC_MENU_API_URL`. Órdenes, mesas y cobro siguen en la API. El plan por pasos, con las pruebas M3-1 a M3-8, está en `03-extraer-menu/plan-de-accion-fase-3-extrae-el-menu.md`.

**Señal:** con Menú apagado no entran líneas nuevas, y sí se puede cobrar lo ya capturado.

**Fuera:** Salón, gateway completo, evento de cocina.

### Fase 4 — Salón, gateway y demo partida

Cerrada en código. Salón responde por gRPC si una mesa existe y está activa (`TableCatalog`). Antes de desactivar, pregunta a Órdenes por gRPC (`HasActiveOrder`). Esos dos `.proto` se suman a `packages/contracts`. El gateway en `3000` reenvía `/menu-items`, `/tables` y `/orders`. La cuenta de mesa sigue en la API y el prefijo `/tables/:id/account` no va a Salón. Pagos no pasa por el gateway. La web usa una sola `NEXT_PUBLIC_API_URL`. El plan por pasos, con las pruebas S4-1 a S4-13, está en `04-salon-y-gateway/plan-de-accion-fase-4-extrae-salon-y-el-gateway.md`.

**Señal:** el flujo de mesa completo pasa por el gateway.

**Fuera:** partir cocina o totales en otro proceso, plegar Salón, Kubernetes, cuatro instalaciones de PostgreSQL.

### Fase 5 — Evento de apoyo

Cerrada en código. Órdenes publica `OrderSentToKitchen` con outbox, en la misma transacción que el paso a `SENT_TO_KITCHEN`. Un relevo marca la fila como publicada después. No es gRPC y no decide el total ni el cierre. La pantalla de cocina sigue por REST. El plan por pasos, con las pruebas K5-1 a K5-8, está en `05-evento-cocina/plan-de-accion-fase-5-publica-el-evento-de-cocina.md`. Migración `0016_polite_payback.sql`.

**Señal:** el evento no decide el total ni el cierre.

**Fuera:** convertir el cobro o la captura de precio en eventos.

## 5. Fuera de todo el plan

- Reescribir las reglas de venta. RF3 y RF4 se mueven con Órdenes.
- Auth, delivery real, pasarela real, app móvil.
- Un servicio por caso de uso, un servicio de cocina o un servicio de totales.
- gRPC entre el navegador y el gateway, o un gateway que traduzca REST a gRPC.
- Estilo event-driven como base del sistema.
- Compartir la entidad `Order` entre servicios.
- Redactar aquí los cinco planes específicos.

## 6. Cómo se escribe uno

Cuando se pida implementar una fase:

1. Leer `analisis.md` y la sección de esa fase en este archivo.
2. Crear la carpeta de la tabla de la sección 2 con `analisis.md` y `plan-de-accion-fase-N-<qué-hace>.md`.
3. Cumplir las siete partes de la sección 3. Acordar el plan antes de codear.
4. Implementar solo esa fase. Al cerrarla, el demo de piso sigue y la señal de la sección 4 se cumple.
5. Parar. El plan de la fase siguiente se escribe cuando se pida.

## 7. Siguiente paso

Cerrado. Las cinco fases están en código. No hay fase 6. No se escribe otro plan.

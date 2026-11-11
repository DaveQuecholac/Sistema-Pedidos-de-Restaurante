# Plan de acción — Fase 5 · Publicar el evento de cocina

**Fecha:** 28 de octubre de 2026  
**Análisis de la fase:** `analisis.md` en esta carpeta.  
**Corte:** `../analisis.md`, sección 6. **Plan general:** `../plan-de-accion-general-corte-a-microservicios.md`.  
**Estado:** cerrado en código el 28 de octubre de 2026. Migración `apps/api/drizzle/0016_polite_payback.sql`. La corrida está en `docs/desarrollo/pruebas-cttm.md`. La fase 4 sigue en `0000_naive_white_queen.sql` y `0015_eminent_earthquake.sql`. Es el último plan del corte. No hay fase 6.  
**Ya en código:** fases 1 a 4. Gateway `3000`, Menú `3002` / gRPC `50052`, Salón `3003` / gRPC `50053`, API `3001` y gRPC `50054`, Pagos gRPC `50051`. La migración anterior de la API es `0015_eminent_earthquake.sql`. `SendToKitchen` llama a `order.sendToKitchen()` y `orders.save`. Ese `save` ya abre una transacción.

Al cerrar, enviar a cocina sigue respondiendo igual por el gateway. Además queda el aviso `OrderSentToKitchen`, escrito en la misma transacción que el cambio de estado.

---

## 1. Resultado

La base de órdenes tiene `order_outbox`. Cada transición que deja la orden en `SENT_TO_KITCHEN` inserta ahí una fila, en la misma transacción que el `UPDATE`. Un caso `PublishPendingKitchenEvents` marca como publicadas las filas que todavía no lo están. El HTTP de cocina no lee esa tabla.

**Señal:** el cobro y el total no dependen del evento. Con el relevo sin correr, la orden ya está `SENT_TO_KITCHEN` y `GET /orders?status=SENT_TO_KITCHEN` la devuelve. Si la fila de outbox no se puede insertar, la orden sigue en `OPEN`.

## 2. Archivos

### Se crean

| Archivo | Rol |
|---------|-----|
| `apps/api/drizzle/0016_*.sql` | Tabla `order_outbox`. Solo `db:generate` |
| `apps/api/src/application/ports/kitchen-event-publisher.ts` | `publish(event): Promise<void>` |
| `apps/api/src/application/order/publish-pending-kitchen-events.ts` | Relevo: lee pendientes, publica, marca |
| `apps/api/src/infrastructure/order/logging-kitchen-event-publisher.ts` | Adaptador de ese puerto. Escribe el aviso en el log. No llama a otro servicio |
| Specs de la sección 5 | K5-1 a K5-8 |

El sufijo de `0016` lo pone Drizzle Kit.

### Se tocan

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/infrastructure/persistence/drizzle/schema/order.ts` | Define `order_outbox` |
| `apps/api/src/infrastructure/persistence/drizzle/drizzle-order-repository.ts` | Dentro de la transacción de `save`, inserta el evento solo cuando el estado guardado pasa a `SENT_TO_KITCHEN` |
| `apps/api/src/app.module.ts` | Registra el publicador y `PublishPendingKitchenEvents` |
| `apps/api/src/main.ts` | Arranca un relevo periódico. El `POST` no lo espera |

### No se tocan

- `domain/order/order.ts` y `order-status.ts`. `sendToKitchen` sigue siendo la misma transición.
- `SendToKitchen` como caso de uso, salvo que su spec nuevo solo observe el outbox a través del repositorio.
- `apps/menu`, `apps/salon`, `apps/payments`, `apps/gateway`, `apps/web`.
- `payment.proto`, `menu.proto`, `salon.proto`, `orders.proto`.
- Cobro, totales, cuenta de mesa, alta de líneas.

Si hace falta un archivo fuera de esta lista, se anota en el chat y se acuerda antes de seguir.

## 3. Capas

| Capa | Qué |
|------|-----|
| Dominio | No se entera del outbox. La regla de «enviar a cocina» sigue en `Order.sendToKitchen` |
| Application | Puerto `KitchenEventPublisher` y caso `PublishPendingKitchenEvents`. No calculan dinero ni cierran la orden |
| Adaptador de persistencia | La fila nace en la transacción de `save`. El relevo solo actualiza `published_at` |
| Adaptador del aviso | Log. No es gRPC ni HTTP hacia Menú, Salón o Pagos |
| HTTP | `POST /orders/:id/send-to-kitchen` responde la orden guardada, igual que hoy |
| Composition root | Elige el publicador de log y el intervalo del relevo. `process.env` solo ahí |

## 4. Contrato

### 4.1 Tabla

`order_outbox` en la base de la API:

| Columna | Regla |
|---------|--------|
| `id` | texto, clave primaria |
| `event_type` | texto no nulo. En esta fase solo `OrderSentToKitchen` |
| `order_id` | texto no nulo. No es clave foránea |
| `status` | texto no nulo, siempre `SENT_TO_KITCHEN` en esta fase |
| `occurred_at` | timestamp con zona, no nulo |
| `published_at` | timestamp con zona, nulo hasta que el relevo publica |

Único `(order_id, event_type)`. Check: `event_type = 'OrderSentToKitchen'` y `status = 'SENT_TO_KITCHEN'`.

El SQL de `0016` es un `CREATE TABLE` con ese único y esos checks. No altera `orders` ni `order_lines`. Si trae algo más, `drizzle-kit drop` de esa migración y se regenera. No se edita el `.sql`. Si `db:migrate` falla, se para.

### 4.2 Cuándo se inserta

Dentro de la transacción que ya tiene `save`:

1. Lee el estado de la fila antes del `UPDATE`.
2. Guarda la orden como hoy (versión, estado, líneas).
3. Si ese `UPDATE` afectó una fila, el estado anterior no era `SENT_TO_KITCHEN` y el estado nuevo sí lo es, inserta una fila de outbox con `published_at` nulo.
4. Si el `INSERT` falla, la transacción entera revierte: la orden no queda enviada.

No se inserta al cobrar, al empezar a cocinar, al marcar listo ni al capturar una línea. Un segundo `save` de una orden que ya está en `SENT_TO_KITCHEN` no inserta otra fila.

### 4.3 Relevo

`PublishPendingKitchenEvents.execute()`:

1. Lee filas con `published_at` nulo, en orden de `occurred_at`.
2. Por cada una llama `publisher.publish` con `orderId`, `eventType` y `occurredAt`.
3. Si `publish` resuelve, pone `published_at` a la hora actual.
4. Si `publish` lanza, deja `published_at` nulo y sigue con la siguiente. La orden no se toca.

El `POST` no llama a este caso. `main.ts` lo corre en un intervalo (el valor concreto sale de env en el arranque, con un default de unos segundos). Los tests lo invocan a mano.

El publicador de log no abre red. Un fallo suyo no devuelve la orden a `OPEN`.

### 4.4 Lo que el HTTP sigue haciendo

`POST /orders/:orderId/send-to-kitchen` por el gateway (`3000`) o la API (`3001`) devuelve la orden en `SENT_TO_KITCHEN` aunque `published_at` siga nulo. `GET /orders?status=SENT_TO_KITCHEN` la lista sin leer el outbox. El total de esa orden es el de sus líneas, el mismo de antes del aviso.

## 5. Pruebas

### Sin otros procesos

```bash
env -u DATABASE_URL pnpm --filter @restaurante/api test
pnpm --filter @restaurante/api typecheck
```

| Id | Qué demuestra |
|----|----------------|
| K5-1 | `PublishPendingKitchenEvents` con un publicador de prueba marca `published_at` y no cambia el estado de la orden |
| K5-2 | Si `publish` lanza, esa fila sigue con `published_at` nulo. La siguiente fila sí se publica |
| K5-3 | `order.sendToKitchen()` sin líneas sigue en `EmptyOrderError`. Una orden `CLOSED` sigue sin poder enviarse. Esos tests de dominio no mencionan el outbox |

El repositorio en memoria de los specs de `SendToKitchen` no escribe outbox. Esos specs siguen verdes sin base.

### Con la base de órdenes

`ORDER_REPOSITORY_INTEGRATION=1` y `DATABASE_URL`, después de migrar `0016`.

| Id | Qué demuestra |
|----|----------------|
| K5-4 | `save` de una orden que pasa a `SENT_TO_KITCHEN` deja una fila `OrderSentToKitchen` con `published_at` nulo y la orden en ese estado. `beginCooking` y un cierre no agregan otra fila de ese tipo |
| K5-5 | Dos filas del mismo `order_id` y `OrderSentToKitchen` las rechaza la base |
| K5-6 | Si el `INSERT` del outbox falla dentro de la transacción, la orden sigue en `OPEN` y no hay fila |

K5-6 se provoca con un tipo de evento que el check rechaza, o insertando antes un duplicado en la misma transacción de prueba. No se deja un fallo permanente en el repositorio de producto.

### Cruce por el gateway

Menú, Salón, API, Pagos y gateway como en la fase 4.

| Id | Qué demuestra |
|----|----------------|
| K5-7 | `POST http://localhost:3000/orders/:id/send-to-kitchen` deja la orden en `SENT_TO_KITCHEN` y una fila sin publicar. `GET http://localhost:3000/orders?status=SENT_TO_KITCHEN` la incluye. El total del `GET /orders/:id/totals` es el de las líneas |
| K5-8 | Se corre el relevo. `published_at` queda puesto. La orden sigue en `SENT_TO_KITCHEN`. Se apaga el relevo, se envía otra orden, se cobra la primera: el cobro no exige fila publicada, y la segunda orden queda enviada con `published_at` nulo |

`pnpm --filter @restaurante/web test` no cambia: la web no lee el outbox. Si falla, se para para confirmar que no se editó `apps/web`.

## 6. Demo de piso

Gateway en `3000` y el resto como quedó en la fase 4. El relevo puede estar apagado en los pasos 1 a 4.

1. Alta de plato y de mesa por el `3000`, orden de esa mesa, una línea.
2. `GET /orders/:id/totals` y anotar el total.
3. `POST /orders/:id/send-to-kitchen`. La respuesta trae `SENT_TO_KITCHEN`.
4. En la base de órdenes, una fila en `order_outbox` con ese `order_id`, `event_type = OrderSentToKitchen` y `published_at` nulo. `GET /orders?status=SENT_TO_KITCHEN` por el `3000` incluye la orden.
5. Se corre el relevo una vez. `published_at` deja de ser nulo. El estado de la orden no cambia. El total del paso 2 sigue igual.
6. Cocina (`begin-cooking`, `mark-ready`) y cierre en efectivo. No aparece una segunda fila `OrderSentToKitchen` para esa orden.

Sin la migración `0016`, la fase no se marca cerrada.

## 7. Fuera

- Eventos de cobro, de precio o de `IN_KITCHEN` / `READY`.
- Broker, cola externa, gRPC de este aviso, otro proceso.
- Que la pantalla de cocina deje de usar `GET /orders`.
- Mover el outbox a Menú, Salón o Pagos.
- Un sexto plan. Este cierra la lista.

## 8. Pasos

1. Leer el análisis de esta carpeta y la sección 6 de `../analisis.md`. No inventar una fase 6.
2. Declarar `order_outbox` en el schema. `db:generate` → revisar el `0016` contra la sección 4.1 → `db:migrate`.
3. Insertar el evento dentro de la transacción de `save`, con la regla de la sección 4.2. Verdes K5-4, K5-5 y K5-6.
4. Puerto, caso de relevo y adaptador de log. Verdes K5-1 y K5-2. El dominio de la orden sigue pasando K5-3.
5. Intervalo del relevo en `main.ts`. El `POST` no lo espera.
6. `pnpm dev:restart`. Correr K5-7, K5-8 y la demo de la sección 6.
7. Anotar la corrida en `docs/desarrollo/pruebas-cttm.md`, con el nombre real del `0016`. No borrar las corridas de las fases 1 a 4.
8. En el plan general, marcar la fase 5 como cerrada en código y el corte de planes como completo. Marcar este archivo como cerrado, con la fecha y la migración.

Si el paso 2 falla, no se sigue. No se escribe el SQL a mano.

## 9. Siguiente paso

Cerrado. No hay fase 6. No se escribe otro plan.

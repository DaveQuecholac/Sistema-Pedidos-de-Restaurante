# Análisis — Fase 5 · Publicar el evento de cocina

**Fecha:** 28 de octubre de 2026  
**Plan:** `plan-de-accion-fase-5-publica-el-evento-de-cocina.md` en esta carpeta.  
**Corte:** `../analisis.md` (sección 6). **Plan general:** `../plan-de-accion-general-corte-a-microservicios.md`, fase 5.  
**Estado:** cerrada en código el 28 de octubre de 2026. Migración `0016_polite_payback.sql`. La fase 4 sigue en `0000_naive_white_queen.sql` y `0015_eminent_earthquake.sql`.  
**Ya en código:** fases 1 a 4. El gateway está en `3000`. Menú, Salón, Órdenes y Pagos ya están partidos. `SendToKitchen` guarda la orden en `SENT_TO_KITCHEN` y, en la misma transacción, la fila `OrderSentToKitchen`. La pantalla de cocina lee por REST.

## 1. Qué se decide

Al confirmar el paso a `SENT_TO_KITCHEN`, la misma transacción escribe una fila `OrderSentToKitchen` en `order_outbox`, en la base de órdenes. Un relevo posterior marca esa fila como publicada. Si el relevo falla, la orden ya quedó enviada y la fila sigue pendiente para el siguiente intento.

El evento no calcula totales, no cobra y no cambia el estado. `POST /orders/:id/send-to-kitchen` responde cuando la orden se guardó, sin esperar al relevo. La cocina sigue listando por `GET /orders?status=SENT_TO_KITCHEN`.

No hay broker nuevo ni otro proceso. No es gRPC. No se publican `beginCooking`, `markReady` ni el cierre.

## 2. Qué queda cierto al terminar

- Toda orden que pasó a `SENT_TO_KITCHEN` tiene una fila de outbox con su id.
- Si insertar esa fila falla, la orden no cambia de estado.
- Con el relevo apagado, el `POST` igual deja la orden en `SENT_TO_KITCHEN` y la cocina la ve por REST.
- Cobrar no lee ni escribe el outbox.

## 3. Qué no decide

Otro evento, una pantalla que dependa del aviso, ni un sexto servicio. Con esta fase se cierra la lista de planes del corte.

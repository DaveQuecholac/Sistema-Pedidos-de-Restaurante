# Análisis — Fase 2 · Extraer Pagos por gRPC

**Fecha:** 28 de octubre de 2026  
**Plan:** `plan-de-accion-fase-2-extrae-pagos-por-grpc.md` en esta carpeta.  
**Corte:** `../analisis.md` (secciones 5, 6 y 7). **Plan general:** `../plan-de-accion-general-corte-a-microservicios.md`, fase 2.  
**Estado:** cerrada en código el 28 de octubre de 2026. Migraciones `0012_late_tarantula.sql`, `0013_milky_magma.sql` y `0000_military_mac_gargan.sql`. La fase 1 sigue en `0011_talented_scorpion.sql`.

## 1. Qué se decide

El cargo sale del proceso de la API. Efectivo, tarjeta y pasarela simulada viven en `apps/payments`, con base `payments` en el mismo Postgres. Órdenes sigue orquestando `CloseOrder` y `CloseTableAccount` y habla con Pagos por gRPC. El navegador sigue cerrando por REST en la API (`POST /orders/:orderId/close` y `POST /tables/:tableId/account/close`). Pagos no abre HTTP.

La fila rica del pago (medio, monto, efectivo entregado, últimos 4, referencia del pagador, `reference`, fecha) se muda a Pagos. En la base de la API quedan `payment_id` y `payment_reference` en la orden que se cobra sola, y los mismos dos datos en la cuenta de mesa. Una orden cerrada por cuenta de mesa sigue sin pago propio: el cargo cuelga del sitting, como hoy.

`PaymentPort` no cambia de forma. Cambia el adaptador: de las tres clases en proceso a un cliente gRPC. `CloseOrder` ya pide el void si no puede guardar el cierre. Esa saga se queda.

## 2. Qué queda cierto al terminar

- Un cobro de prueba cruza de proceso y la fila queda en la base `payments`.
- Repetir el cargo del mismo `orderId` o `sittingId`, con el mismo monto y el mismo medio, devuelve la misma `reference` y no inserta otra fila.
- Si la API no guarda el cierre, llama `Void`. El cargo queda anulado y la orden sigue en `READY`.
- `GET /orders/:orderId/payment` sigue devolviendo efectivo entregado y cambio. El cambio se calcula en el dominio de la orden, con el efectivo que Pagos guardó.
- Las tablas `order_payments` y `table_sitting_payments` ya no existen en la base de la API.

## 3. Qué no decide

Extraer Menú o Salón, el gateway, un `.proto` de catálogo, pasarela real, ni una ruta REST de Pagos.

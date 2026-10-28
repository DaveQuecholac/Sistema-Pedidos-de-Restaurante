# Análisis — Fase 4 · Extraer el salón y poner el gateway

**Fecha:** 28 de octubre de 2026  
**Plan:** `plan-de-accion-fase-4-extrae-salon-y-el-gateway.md` en esta carpeta.  
**Corte:** `../analisis.md` (secciones 3, 5, 6 y 9). **Plan general:** `../plan-de-accion-general-corte-a-microservicios.md`, fase 4.  
**Estado:** cerrada en código el 28 de octubre de 2026. Migraciones `0000_naive_white_queen.sql` y `0015_eminent_earthquake.sql`. La fase 3 sigue en `0000_absurd_solo.sql` y `0014_real_infant_terrible.sql`.  
**Ya en código:** fase 1 (`0011_talented_scorpion.sql`, `menu_item_id` sin clave foránea), fase 2 (Pagos en gRPC, base `payments`, `payment.proto`) y fase 3 (Menú en REST `3002` y gRPC `50052`, base `menu`, `menu.proto`).

## 1. Qué se decide

El plano de mesas sale a `apps/salon`, con base `salon`. Ahí viven etiqueta, zona y alta o baja. La cuenta de mesa (`table_sittings` y su cobro) se queda en la API, porque cierra órdenes.

Abrir una orden de mesa pregunta por gRPC si la mesa existe y está activa (`TableCatalog`, puerto `50053`). Dar de baja una mesa pregunta por gRPC a la API si hay comanda activa (`HasActiveOrder`, puerto `50054`). Una orden con id externo no llama a Salón.

El gateway escucha REST en `http://localhost:3000`. Reenvía y no traduce a gRPC. No tiene base ni reglas de venta. Pagos no pasa por él. La web deja de conocer `3001`, `3002` y el puerto de Salón: todo el navegador entra por `3000`.

## 2. Qué queda cierto al terminar

- `GET/POST /tables` en el `3000` llega a Salón. `POST /tables/:id/account/close` llega a la API.
- `GET/POST /menu-items` en el `3000` llega a Menú. `/orders` llega a la API.
- Con una comanda activa, desactivar la mesa se rechaza y la mesa sigue activa.
- Con Salón apagado no se abre orden de mesa, y sí se abre una con id externo. Una orden ya abierta se puede cobrar.

## 3. Qué no decide

El evento `OrderSentToKitchen`, partir cocina o totales, ni publicar Pagos.

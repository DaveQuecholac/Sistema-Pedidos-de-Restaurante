# Análisis — Fase 3 · Extraer el menú

**Fecha:** 28 de octubre de 2026  
**Plan:** `plan-de-accion-fase-3-extrae-el-menu.md` en esta carpeta.  
**Corte:** `../analisis.md` (secciones 3, 5 y 6). **Plan general:** `../plan-de-accion-general-corte-a-microservicios.md`, fase 3.  
**Estado:** cerrada en código el 28 de octubre de 2026. Migraciones `0000_absurd_solo.sql` y `0014_real_infant_terrible.sql`. La fase 2 sigue en `0012_late_tarantula.sql`, `0013_milky_magma.sql` y `0000_military_mac_gargan.sql`.  
**Ya en código:** fase 1 (`0011_talented_scorpion.sql`, `menu_item_id` sin clave foránea) y fase 2 (Pagos en gRPC, base `payments`, `payment.proto`).

## 1. Qué se decide

El catálogo sale del proceso de la API. `apps/menu` es dueño de platos, ingredientes y modificadores, con base `menu` en el mismo Postgres. El admin sigue en REST, con el mismo JSON de hoy, en el puerto 3002. La web de platos apunta solo ahí (`NEXT_PUBLIC_MENU_API_URL`). Órdenes, mesas, totales y cobro siguen en `http://localhost:3001`. No hay gateway: unifica las URLs la fase 4.

`AddLine` y `ModifyLine` dejan de usar `MenuRepository`. Piden el plato vigente por gRPC (`MenuCatalog`, puerto 50052) y congelan nombre, precio, impuesto y modificadores en la línea, como ya hace `LineItem`. Un plato que no existe o está inactivo se rechaza antes de guardar. Si Menú no responde, no entra una línea nueva; una orden que ya tiene líneas sí puede ir a cocina y cobrarse.

## 2. Qué queda cierto al terminar

- Las tablas `menu_items`, `menu_item_ingredients` y `menu_item_modifiers` están en la base `menu` y ya no en la de la API.
- `order_lines.menu_item_id` sigue siendo texto obligatorio, sin clave foránea.
- Cambiar el precio en Menú no reescribe una línea ya capturada.
- Con el proceso de Menú apagado, `POST /orders/:id/lines` falla y `POST /orders/:id/close` de una orden ya armada sigue pudiendo cobrar.

## 3. Qué no decide

Salón, el gateway, unir la URL de la web, ni el evento de cocina.

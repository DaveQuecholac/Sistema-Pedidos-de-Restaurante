# Análisis — Fase 1 · Soltar la FK de la línea al menú

**Fecha:** 28 de octubre de 2026  
**Plan:** `plan-de-accion-fase-1-suelta-la-fk-de-la-linea.md` en esta carpeta.  
**Corte:** `../analisis.md` (secciones 2.2 y 3). **Plan general:** `../plan-de-accion-general-corte-a-microservicios.md`, fase 1.  
**Estado:** cerrada en código el 28 de octubre de 2026. Migración `0011_talented_scorpion.sql`.

## 1. Qué se decide

Se quita de PostgreSQL la única clave foránea que cruza módulos:

`order_lines.menu_item_id` → `menu_items.id`  
(`order_lines_menu_item_id_menu_items_id_fk`, `ON DELETE restrict`, creada en `apps/api/drizzle/0004_blushing_adam_destine.sql`).

La columna `menu_item_id` se queda, `NOT NULL`. Sigue siendo el id del plato. El nombre, el precio, el impuesto y los modificadores de la línea ya se congelan en `LineItem.capture` y no dependen de esa FK.

Sigue un solo proceso Nest y una sola base. `AddLine` y `ModifyLine` siguen leyendo `MenuRepository` en el mismo proceso. Un plato que no existe sigue rechazándose en el caso de uso (`MenuItemNotFoundError`), antes de guardar.

## 2. Qué queda cierto al terminar

- Una línea cuyo `menuItemId` no tiene fila en `menu_items` se puede persistir y leer, con el nombre y el precio que ya traía.
- El resto de claves foráneas no se toca. En particular las de ingredientes y modificadores del menú, y `order_lines.order_id` → `orders.id`.
- `order_line_modifiers.modifier_id` ya es texto suelto. Esta fase no lo cambia.
- Dar de baja un plato sigue siendo desactivarlo. No se agrega un borrado de platos.

## 3. Qué no decide

Procesos nuevos, gateway, gRPC, `.proto`, mover `order_payments` o `table_sitting_payments`, ni el puerto `MenuCatalog`. Eso empieza en la fase 2.

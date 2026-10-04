# Análisis — Tarea 3 · Pantallas de comanda y cocina, y demo (E2 + E3)

**Rama:** `dev/comanda`  
**Sprint:** 2 (RF2–RF3). Tarea 3 de 3. Solo esta. Cierra la demo del Sprint 2.  
**Fecha:** 4 de octubre de 2026  
**Estado:** acordado el 4 de octubre de 2026. No cambia código.  
**Plan:** `plan-de-accion.md` en esta carpeta.  
**Depende de:** `../02-persistencia-y-api/` cerrada.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Qué pide la tarea

Demo del sprint: abrir una orden, armarla con el menú del Sprint 1, enviarla a cocina e intentar editarla para ver que está bloqueada. El admin del menú sigue funcionando.

Tarjetas de Trello: «Pantalla de comanda (abrir, líneas, cocina, bloqueo)» y «Demo Sprint 2».

## 2. Estilo: el mismo del menú, por ahora

La UI final todavía no llega. Mientras tanto, las pantallas nuevas usan **el mismo lenguaje visual que `/menu`**: marco de monitor (`bezel`, `screen`, `chin`, `neck`, `base`), bordes negros de 2–3 px, fondo transparente, botones de ancho completo con ícono SVG, `details` plegables, una columna por debajo de 40 rem y dos columnas desde 64 rem.

Cómo se reutiliza sin acoplar:

- Se crea `app/orders/orders.module.css` con las clases que hacen falta, **copiadas** de `menu-admin.module.css`, más tres nuevas: insignia de estado, aviso de bloqueo y fila de línea.
- No se importa el CSS del menú desde las órdenes. Si el menú cambia su estilo, las órdenes no se rompen, y al revés.
- No se crea una carpeta `ui/` compartida ni un design system. Cuando llegue la UI final se reemplaza el CSS de cada pantalla en una tarea propia.
- `menu-admin-screen.tsx` y su CSS no se tocan.

La copia es deuda aceptada y temporal. Se anota en el cierre.

## 3. Dependencias entre módulos web

| Desde | Hacia | Para qué | ¿Permitido? |
|-------|-------|----------|-------------|
| `app/orders/` | `app/menu/menu-api.ts` | `listMenuItems` para elegir platos | Sí: la comanda usa la carta |
| `app/orders/` | `app/menu/menu-amount.ts` | `centavosToLabel`, `basisPointsToPercentLabel` | Sí, solo para mostrar |
| `app/kitchen/` | `app/orders/order-api.ts`, `order-view.ts`, `orders.module.css` | La cocina opera sobre órdenes | Sí |
| `app/menu/` | `app/orders/` o `app/kitchen/` | — | **No** |
| Cualquiera | `@restaurante/api`, Drizzle | — | **No** |

## 4. Pantallas

| Ruta | Pantalla | Quién la usa |
|------|----------|--------------|
| `/` | Home con enlaces «Administrar menú», «Comandas», «Cocina» | Todos |
| `/orders` | Órdenes vivas (`OPEN`, `IN_KITCHEN`, `READY`) en el monitor; formulario para abrir comanda por mesa o por pedido externo | Mesero |
| `/orders/[orderId]` | Detalle: origen, estado, líneas en el monitor; formulario para agregar o modificar línea; acciones de estado | Mesero |
| `/kitchen` | Órdenes `IN_KITCHEN` en orden de llegada, con sus platos y modificadores; botón «Marcar lista». Debajo, las `READY` en solo lectura | Cocina |

Las rutas son nombres de código en inglés, como `/menu`. Los textos en pantalla son en español.

## 5. Qué decide el servidor y qué muestra la pantalla

| Tema | Lo decide | La pantalla |
|------|-----------|-------------|
| Si se pueden editar líneas | `allowedActions` incluye `editLines` | Muestra u oculta el formulario y los botones de línea |
| Si se puede enviar a cocina, marcar lista o cancelar | `allowedActions` | Muestra solo esos botones |
| Precio de la línea y de cada modificador | Precio capturado en la respuesta | Lo formatea con `centavosToLabel` |
| Total de la línea o de la orden | **Nadie en este sprint** | No lo muestra. No multiplica precio × cantidad |
| Externo repetido, cantidad fuera de rango, plato inactivo | Dominio, vía 409 / 422 | Muestra el mensaje |
| Varias comandas en la misma mesa | Permitido por el dominio | Cada tarjeta muestra la hora de apertura (`openedAt`) junto a «Mesa 5», para distinguirlas |
| Qué platos se ofrecen | La lista de `GET /menu-items` | Solo los `active`. Si uno se desactiva entre la carga y el envío, el servidor responde 422 y la pantalla lo dice |

El estado `status` se traduce a texto con una función pura: `OPEN` «Abierta», `IN_KITCHEN` «En cocción», `READY` «Lista», `CLOSED` «Cerrada», `CANCELLED` «Cancelada». La traducción es de presentación; no decide permisos.

## 6. Bloqueo de edición (RF3) en la pantalla

Dos capas, y la segunda es la que manda:

1. **La pantalla al día:** si `allowedActions` no trae `editLines`, el formulario de líneas no se dibuja y aparece el aviso: «Esta orden está en cocción. Ya no se pueden agregar, cambiar ni quitar platos.» (con el texto que corresponda al estado).
2. **La pantalla vieja:** si alguien tiene abierta la orden en otra pestaña y la envía a cocina, la primera pestaña todavía muestra el formulario. Al intentar agregar, el servidor responde 409 `OrderNotEditableError` (o `OrderConcurrencyError`). La pantalla muestra el mensaje, vuelve a pedir la orden y deja de mostrar el formulario.

La demo enseña las dos: el bloqueo visible y el rechazo del servidor.

## 7. Elegir modificadores

Al agregar una línea, el formulario muestra los modificadores del plato elegido, en su orden: extras con su precio, omitir como «sin {ingrediente}». Se envían los `modifierIds` actuales del plato.

Al editar una línea, el formulario parte de la cantidad y de las elecciones de la línea. Como los ids de modificador del menú cambian cuando alguien corrige el plato, la preselección se hace por `kind` + `name` contra el plato actual. Si una elección vieja ya no existe en la carta, no se preselecciona y se avisa: «Algún modificador de esta línea ya no está en la carta.» El servidor recaptura al guardar (tarea 1, sección 5.5).

## 8. Errores en pantalla

El cuerpo de error del API es `{ code, message }` con mensaje en inglés de código. Para la demo, la pantalla traduce los `code` de orden que conoce a un texto en español, y si no lo conoce muestra `code: message` como el menú. Ejemplos:

| `code` | Texto |
|--------|-------|
| `ExternalOrderIdInUseError` | Ese pedido externo ya se registró. |
| `OrderNotEditableError` | La orden ya está en cocina. No se puede cambiar. |
| `OrderConcurrencyError` | Otra persona cambió esta orden. Se recargó con lo último. |
| `EmptyOrderError` | Agrega al menos un plato antes de enviar a cocina. |
| `InvalidQuantityError` | La cantidad tiene que ser de 1 a 99. |
| `MenuItemUnavailableError` | Ese plato ya no está a la venta. |

Esta tabla es texto de pantalla, no una regla. Vive en `order-view.ts` y se prueba sin navegador.

Validación local mínima antes del `fetch`: mesa o externo no vacío, plato elegido, cantidad entera. El rango 1–99 lo decide el servidor; la demo lo enseña con un 422.

## 9. Capas

- **Dominio, aplicación, API:** no cambian. Si la pantalla necesita algo que el API no da, se para y se vuelve a la tarea 2.
- **Web:** cliente HTTP de órdenes, funciones puras de vista, tres pantallas, CSS copiado del menú, enlaces en la home.

## 10. Qué no entra

Desglose de totales (Sprint 3), cobro y cierre (Sprint 4), refresco automático o websockets en cocina (hay botón «Actualizar»), impresión de comanda, login, catálogo de mesas, UI final.

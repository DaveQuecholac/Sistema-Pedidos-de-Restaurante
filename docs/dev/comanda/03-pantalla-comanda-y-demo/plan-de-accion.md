# Plan de acción — Tarea 3 · Pantallas de comanda y cocina, y demo (E2 + E3)

**Rama:** `dev/comanda`  
**Sprint:** 2 (RF2–RF3). Tarea 3 de 3. Solo esta. Cierra la demo del Sprint 2.  
**Fecha:** 4 de octubre de 2026  
**Estado:** acordado el 4 de octubre de 2026. Empieza cuando la tarea 2 esté cerrada.  
**Análisis:** `analisis.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Resultado

En `https://restaurante.localhost` se abre una comanda por mesa o por pedido externo, se arma con platos activos del menú, se cambian y quitan líneas, se envía a cocina y la pantalla deja de permitir la edición. Una pestaña vieja que intenta editar recibe el rechazo del servidor y se pone al día. La cocina ve lo que tiene que preparar y lo marca listo. El admin del menú sigue igual. Ninguna pantalla calcula un total.

## 2. No se toca

- `apps/api/**`, salvo correr sus pruebas al final.
- `apps/web/app/menu/**`. Se importan `menu-api.ts` y `menu-amount.ts`; no se modifican.
- Los cinco platos de la demo del menú. No se editan para probar.
- Totales, cobro, cierre.

## 3. Decisiones

| Tema | Decisión |
|------|----------|
| Estilo | Copia de las clases de `menu-admin.module.css` en `orders.module.css`, más insignia de estado, aviso de bloqueo y fila de línea |
| Datos | `fetch` del navegador a `NEXT_PUBLIC_API_URL`, como el menú. Sin Route Handler |
| URL ausente | Mensaje en pantalla. Sin fallback |
| Tras una acción exitosa | Se usa la orden que devolvió la respuesta. No se vuelve a pedir |
| Tras un 409 | Se muestra el mensaje y se vuelve a pedir la orden |
| Tras otro error | Se muestra el mensaje; la orden en pantalla se queda como la confirmó el servidor la última vez |
| Botones de estado | Solo los que trae `allowedActions` |
| Cancelar orden | Pide confirmación con `window.confirm` |
| Precio | `centavosToLabel` del menú. Sin `price * quantity` |
| Cantidad | Texto; se envía si es entero. El rango lo responde el servidor |
| Plato a elegir | Solo `active` de `GET /menu-items` |
| Preselección al editar | Por `kind` + `name` contra el plato actual |
| Cocina | `GET /orders?status=IN_KITCHEN,READY`. Botón «Actualizar». Sin intervalos |
| Parámetros de ruta | Next 15: `params` es una `Promise`; la página la resuelve y pasa `orderId` al componente cliente |

## 4. Capas

- **Dominio, aplicación, API:** igual.
- **Web:** cliente HTTP, vista pura, pantallas, CSS, home.

## 5. Pasos

### Paso 0 — Línea base

1. `pnpm dev:restart`. `/menu` carga los cinco platos.
2. `pnpm --filter @restaurante/web test` y `typecheck`. Anotar el número de pruebas.
3. Con `curl`, el API de la tarea 2 responde `POST /orders` y `GET /orders`.

**Línea base — 4 de octubre de 2026**

| Comando | Resultado |
|---------|-----------|
| `pnpm dev:restart` | API y web online |
| `https://restaurante.localhost/menu` | 200 |
| `GET /menu-items` | 5 platos (4 activos; Consomé inactivo) |
| `pnpm --filter @restaurante/web test` | 2 archivos, **14** pruebas |
| `pnpm --filter @restaurante/web typecheck` | Pasó |
| `POST /orders` mesa `BASE-0` + `GET /orders/:id` + `GET /orders?status=OPEN` | 201 / 200 / 200 |

Piso web que no puede bajar: **14** pruebas. Orden de la línea base: `a9846006-6c1d-4855-884a-ae6033197702` (queda en la BD).

### Paso 1 — Cliente HTTP

`apps/web/app/orders/order-api.ts` y su `order-api.spec.ts`, con la misma forma que `menu-api.ts`:

- `OrderApiError` con `status` y `code`; `OrderApiConfigError` si falta la URL.
- `openOrder`, `listOrders(statuses)`, `getOrder`, `addLine`, `modifyLine`, `cancelLine`, `startCooking`, `markOrderReady`, `cancelOrder`.
- `encodeURIComponent` en cada id de ruta.
- Tipos `OrderJson`, `LineItemJson`, `LineModifierJson` alineados al presentador. `tableId` y `externalOrderId` como `string | null`.
- Si `response.ok` es falso, lee `{ code, message }`; si no, error con el status.

Pruebas W1–W8 con `fetch` simulado.

**Cierre Paso 1 — 4 de octubre de 2026:** `order-api.ts` + W1–W8. `vitest.config.mts` incluye `app/**/*.spec.ts` (antes solo menú). Web: **22** pruebas (14 previas + 8). Typecheck OK. Sin pantallas todavía.

### Paso 2 — Vista pura

`apps/web/app/orders/order-view.ts` y `order-view.spec.ts`:

- `statusLabel(status)`
- `originLabel(order)` → «Mesa 5» o «Pedido externo UBER-1»
- `openedAtLabel(order, timeZone)` → hora local `HH:mm` de `openedAt`; la zona entra por parámetro para que el spec no dependa de la máquina
- `can(order, action)` → si `allowedActions` lo incluye
- `lockNotice(order)` → texto del aviso, o `null` si se puede editar
- `modifierLabel(modifier)` → «+ Queso $15.00» o «sin Cilantro»
- `orderableItems(menu)` → solo activos, en el orden del menú
- `preselect(line, menuItem)` → `{ modifierIds, missing }` por `kind` + `name`
- `errorText(error)` → tabla de la sección 8 del análisis, o `code: message`
- `boardView(state)` → `loading`, `error`, `empty`, `list`

Pruebas V1–V13.

**Cierre Paso 2 — 4 de octubre de 2026:** `order-view.ts` + V1–V13. Web: **35** pruebas (22 + 13). Typecheck OK. Sin pantallas todavía.

### Paso 3 — Comandas (`/orders`)

- `apps/web/app/orders/page.tsx`
- `apps/web/app/orders/orders-screen.tsx` (`'use client'`)
- `apps/web/app/orders/orders.module.css`

Comportamiento:

1. Al montar, `listOrders(['OPEN','IN_KITCHEN','READY'])`. Estados de `boardView`.
2. Cada tarjeta: `originLabel`, hora de apertura (`openedAtLabel`), insignia `statusLabel`, número de líneas, enlace «Ver comanda». Dos comandas de la misma mesa se distinguen por la hora.
3. Formulario «Abrir comanda»: selector Mesa / Pedido externo, un campo de texto, botón «Abrir comanda». Vacío no se envía.
4. Al abrir con éxito, navega a `/orders/{id}`.
5. 409 `ExternalOrderIdInUseError`: mensaje junto al formulario; la lista se vuelve a pedir.
6. Enlaces a «Inicio» y «Cocina».

**Cierre Paso 3 — 4 de octubre de 2026:** `/orders` con lista, formulario «Abrir comanda» y CSS (estilo menú + insignia / aviso / fila). Web: **35** pruebas, typecheck OK. `https://restaurante.localhost/orders` → 200 (SSR muestra carga; el cliente hidrata la lista). El detalle `/orders/[id]` llega en el Paso 4.

### Paso 4 — Detalle (`/orders/[orderId]`)

- `apps/web/app/orders/[orderId]/page.tsx`
- `apps/web/app/orders/[orderId]/order-detail-screen.tsx` (`'use client'`)

Comportamiento:

1. Al montar, `getOrder` y `listMenuItems` en paralelo. Si la orden da 404, mensaje «Esa comanda no existe» y enlace a `/orders`.
2. Encabezado: `originLabel`, insignia de estado, enlace «Comandas».
3. Monitor: una fila por línea con nombre, «× cantidad», precio unitario, modificadores con `modifierLabel`. Sin importe de línea.
4. Si `can(order, 'editLines')`: botones «Editar» y «Quitar» por línea, y el formulario a la derecha.
5. Formulario: plato (`orderableItems`), cantidad (por defecto `1`), casillas de modificadores del plato elegido. Botón «Agregar plato». En modo edición, «Guardar cambios» y «Cancelar»; si `preselect` dice `missing`, el aviso de la sección 7 del análisis.
6. Si no se puede editar: no hay formulario ni botones de línea; aparece `lockNotice`.
7. Barra de acciones: «Enviar a cocina», «Marcar lista», «Cancelar orden», cada una solo si `can`.
8. Botones deshabilitados mientras hay una petición en curso.
9. Éxito: `setOrder(respuesta)`. 409: `errorText` y `getOrder` de nuevo. Otro error: `errorText`.
10. Lista de platos vacía o error al cargar el menú: aviso «No se pudo cargar el menú» y el formulario no se dibuja; las acciones de estado siguen disponibles.

**Cierre Paso 4 — 4 de octubre de 2026:** `page.tsx` (resuelve `params`) + `order-detail-screen.tsx` (carga orden+menú, monitor, formulario, `allowedActions`, 404/409/menú fallido, `lockNotice`). CSS: `checkList` / `actionBar` ya en `orders.module.css`. Web: **35** pruebas, typecheck OK. `POST /orders` → `GET /orders/{id}` página 200; id inexistente 200 con shell de «no existe» tras hidratar. Recorrido B1–B22 queda en el Paso 7.

### Paso 5 — Cocina (`/kitchen`)

- `apps/web/app/kitchen/page.tsx`
- `apps/web/app/kitchen/kitchen-screen.tsx` (`'use client'`), usa `orders.module.css`

Comportamiento:

1. `listOrders(['IN_KITCHEN','READY'])`. Arriba, «En cocción» por orden de llegada; abajo, «Listas».
2. Cada tarjeta en cocción: `originLabel`, hora de `openedAt` en hora local, líneas con cantidad y modificadores, botón «Marcar lista» si `can(order, 'markReady')`.
3. Tras marcar, se reemplaza esa orden con la respuesta.
4. Botón «Actualizar» vuelve a pedir la lista.

**Cierre Paso 5 — 4 de octubre de 2026:** `kitchen/page.tsx` + `kitchen-screen.tsx` (reusa `orders.module.css`). Lista `IN_KITCHEN` / `READY` por llegada, «Marcar lista» reemplaza la orden en memoria, «Actualizar» refetch. Web: **35** pruebas, typecheck OK. `https://restaurante.localhost/kitchen` → 200. Smoke API con orden en cocción OK.

### Paso 6 — Home

`apps/web/app/page.tsx`: agregar «Comandas» (`/orders`) y «Cocina» (`/kitchen`) junto a «Administrar menú».

**Cierre Paso 6 — 4 de octubre de 2026:** Home con enlaces «Administrar menú», «Comandas» y «Cocina». Web: **35** pruebas, typecheck OK. `https://restaurante.localhost/` → 200 con los tres enlaces.

### Paso 7 — Verificación

1. `pnpm --filter @restaurante/web test` y `typecheck`.
2. `env -u DATABASE_URL pnpm --filter @restaurante/api test` y `typecheck`.
3. Revisión de código: sección 8.
4. `pnpm dev:restart`.
5. Recorrido de la sección 7, en 1280 px y en 390 px.
6. Corrida CTTM en `docs/desarrollo/pruebas-cttm.md`.
7. Anotar la sección 10.

## 6. Catálogo sin navegador

### Cliente HTTP

| Id | Dado | Entonces |
|----|------|----------|
| W1 | Falta `NEXT_PUBLIC_API_URL` | `OrderApiConfigError` y no hay `fetch` |
| W2 | `openOrder({ tableId: '5' })` | `POST /orders` con ese cuerpo exacto |
| W3 | `listOrders(['IN_KITCHEN','READY'])` | `GET /orders?status=IN_KITCHEN,READY` |
| W4 | `addLine('o 1', …)` | ruta con `o%201` |
| W5 | `cancelLine` | método `DELETE`, sin cuerpo |
| W6 | Respuesta 409 `{ code, message }` | `OrderApiError` con status 409 y ese `code` |
| W7 | Respuesta 500 sin JSON | `OrderApiError` sin `code` inventado |
| W8 | `fetch` lanza | «No se pudo contactar el API.» |

### Vista

| Id | Dado | Entonces |
|----|------|----------|
| V1 | Los cinco estados | Abierta, En cocción, Lista, Cerrada, Cancelada |
| V2 | Orden con `tableId` y orden con `externalOrderId` | «Mesa 5» / «Pedido externo UBER-1» |
| V3 | `allowedActions` `["markReady","cancel"]` | `can editLines` falso, `markReady` verdadero |
| V4 | `IN_KITCHEN` | `lockNotice` habla de cocción; `OPEN` da `null` |
| V5 | Extra de 1500 y exclusión | «+ Queso $15.00» / «sin Cilantro» |
| V6 | Menú con un plato inactivo | `orderableItems` no lo trae y conserva el orden |
| V7 | Línea con «Queso» y plato con «Queso» de id nuevo | `preselect` devuelve el id nuevo, `missing` falso |
| V8 | Línea con un modificador que ya no está en el plato | no lo incluye, `missing` verdadero |
| V9 | `OrderNotEditableError` y `ExternalOrderIdInUseError` | textos en español de la tabla |
| V10 | `code` desconocido | `code: message` |
| V11 | Error sin `code` | solo el mensaje |
| V12 | Cargando, error, `[]`, una orden | `loading`, `error`, `empty`, `list` |
| V13 | `openedAt` `2026-10-04T18:05:00.000Z` con zona `America/Mexico_City` | `12:05` |

## 7. Recorrido en el navegador

Con API y web recién reiniciados. Anotar pasó o falló por ítem, con fecha. Las mesas usan el prefijo `D2-` para reconocerlas.

| Id | Qué hacer | Entonces |
|----|-----------|----------|
| B1 | Abrir `/` | «Administrar menú», «Comandas», «Cocina» |
| B2 | «Comandas» | Llega a `/orders`; se ve la carga y luego la lista o el vacío |
| B3 | Abrir con la mesa vacía | Mensaje local; no sale `POST` en la red |
| B4 | Abrir mesa `D2-1` | Navega al detalle; «Mesa D2-1», «Abierta», sin líneas; no hay «Enviar a cocina» |
| B5 | Agregar Tacos de suadero ×2 con Queso y sin Cilantro | La línea muestra `$45.00`, «× 2», «+ Queso $15.00», «sin Cilantro». No hay total |
| B6 | Agregar Agua de jamaica ×1 sin modificadores | Dos líneas, en ese orden; aparece «Enviar a cocina» |
| B7 | Agregar con cantidad `100` | Mensaje «La cantidad tiene que ser de 1 a 99.» del 422; no se agrega |
| B8 | Editar los tacos: cantidad 3, quitar Queso | Misma posición; «× 3»; sin Queso |
| B9 | Quitar el agua | Queda una línea |
| B10 | Recargar la página | La orden sigue igual (viene del servidor) |
| B11 | Abrir otra comanda en la mesa `D2-1` desde `/orders`; luego abrir dos veces el externo `D2-EXT-0` | La segunda de `D2-1` se crea y en `/orders` hay dos tarjetas «Mesa D2-1» con horas distintas; el segundo `D2-EXT-0` muestra «Ese pedido externo ya se registró.» y no se crea |
| B12 | En el detalle de `D2-1`, abrir una segunda pestaña con la misma orden | Las dos muestran «Abierta» y el formulario |
| B13 | En la pestaña 2, «Enviar a cocina» | Estado «En cocina» (`SENT_TO_KITCHEN`); desaparece el formulario; aviso de bloqueo; aún se puede cancelar |
| B14 | En la pestaña 1 (vieja), agregar un plato | Mensaje de orden en cocina o cambiada; se recarga en «En cocina» sin la línea nueva |
| B15 | `/kitchen` → «Poner en cocción» | Primero en «Pendientes»; tras el botón pasa a «En cocción» con «Tacos de suadero × 3 · sin Cilantro» |
| B16 | «Marcar lista» | Pasa a «Listas»; en el detalle, «Lista» y sin acciones |
| B17 | Abrir pedido externo `D2-EXT-1`, agregar un plato, «Cancelar orden» y confirmar | «Cancelada», sin formulario ni acciones |
| B18 | Abrir `/orders/no-existe` | «Esa comanda no existe» y enlace a comandas |
| B19 | Detener solo `restaurante-api` en PM2 (la web sigue arriba) y recargar `/orders` | Mensaje de error y «Reintentar»; ninguna tarjeta inventada. Al volver la API, «Reintentar» muestra la lista real |
| B20 | 1280 px y 390 px en `/orders`, el detalle y `/kitchen` | Una columna en estrecho, dos en ancho; acciones alcanzables; sin scroll horizontal |
| B21 | Regresión: `/menu` | Lista los cinco platos; editar y cancelar sin guardar funciona como antes |
| B22 | Regresión: desactivar un plato en `/menu` y volver al detalle de una comanda abierta | El plato ya no aparece para elegir; las líneas que ya lo tenían siguen igual. Reactivarlo al terminar |

B22 cambia un plato de la demo y lo deja como estaba. Si no se quiere tocar, se anota como no ejecutado; la regla ya la cubren LI9 y P11.

### Resultado del recorrido — 4 de octubre de 2026

Ejecución mixta: API + páginas HTTPS + stop/restart de `restaurante-api` + revisión de CSS (media 40rem / 64rem). Prefijo `D2-`. Orden principal: `1fd99515-1043-4af9-b5ac-01e73ef7f2ae` (mesa `D2-1` → READY).

| Id | Resultado | Nota |
|----|-----------|------|
| B1 | Pasó | Home con menú, comandas y cocina |
| B2 | Pasó | `/orders` 200 |
| B3 | Pasó | Guard local de origen vacío en `orders-screen` |
| B4 | Pasó | `D2-1` OPEN sin `sendToKitchen` |
| B5 | Pasó | Tacos ×2 + Queso + sin Cilantro; sin totales |
| B6 | Pasó | Agua ×1; aparece `sendToKitchen` |
| B7 | Pasó | Cantidad 100 → 422 `InvalidQuantityError` |
| B8 | Pasó | Tacos ×3 sin Queso, misma posición |
| B9 | Pasó | Queda 1 línea |
| B10 | Pasó | GET persiste el estado |
| B11 | Pasó | Segunda mesa `D2-1` OK; externo repetido → `ExternalOrderIdInUseError` (id fresco `D2-EXT-B11`) |
| B12 | Pasó | OPEN con `editLines` (equivalente a dos pestañas al día) |
| B13 | Pasó | `SENT_TO_KITCHEN` / «En cocina» |
| B14 | Pasó | Add en enviado → 409; sigue 1 línea |
| B15 | Pasó | Pendiente → `begin-cooking` → `IN_KITCHEN` |
| B16 | Pasó | `READY`, sin acciones |
| B17 | Pasó | Cancelado + panel in-app `confirmPanel` |
| B18 | Pasó | `/orders/no-existe` 200 (mensaje tras hidratar) |
| B19 | Pasó | API down; web sigue; al volver lista OK |
| B20 | Pasó | CSS cocina/comandas con breakpoints 40rem/64rem y `overflow-x: clip` |
| B21 | Pasó | `/menu` 200; 5 platos |
| B22 | Pasó | Flan desactivado no sale en carta activa; línea previa intacta; reactivado |

## 8. Revisión de código

| Id | Entonces |
|----|----------|
| R1 | `rg "@restaurante/api|drizzle" apps/web/app` vacío |
| R2 | `rg "quantity \*|\* .*quantity|reduce\(" apps/web/app/orders apps/web/app/kitchen` sin cálculo de importes |
| R3 | Ningún archivo de `app/menu/` importa de `app/orders/` ni de `app/kitchen/` |
| R4 | `git diff --stat apps/api apps/web/app/menu` vacío para esta tarea |
| R5 | Los botones de estado y el formulario dependen de `can(...)`, no de comparar `status` |

## 9. Cierre del sprint

Al terminar esta tarea:

1. Corrida CTTM nueva en `docs/desarrollo/pruebas-cttm.md` con las tres tareas del sprint.
2. Actualizar `docs/README.md` si cambió alguna carpeta.
3. Si Hector lo pide, `docs/dev/comanda/cierre-del-modulo.md` en lenguaje del local, como el del menú.
4. Anotar la deuda: CSS copiado del menú hasta la UI final.

## 10. Hecho cuando

- [x] W1–W9 y V1–V13 pasan (4 oct 2026; W9 = `sendToKitchen`/`beginCooking` exportados)
- [x] B1–B22 anotados con fecha (4 oct 2026); layout 390/1280 vía CSS + páginas 200
- [x] R1–R5 se cumplen (R1: solo texto de home; botones vía `can`; columnas/avisos usan `status` de presentación)
- [x] Pruebas y typecheck de API y web pasan; web **36**; API **210** (+ skipped P*)
- [x] La demo del Sprint 2 se puede hacer de punta a punta con el ciclo RF3 (enviar → pendiente cocina → cocción → lista)
- [x] El admin del menú sigue funcionando (`/menu` 200, 5 platos)

## 11. Cierre

**Fecha:** 4 de octubre de 2026.  
**CTTM:** `docs/desarrollo/pruebas-cttm.md` — corrida comanda tarea 3. Nivel 3 RF2–RF3.  
**Cierre de módulo:** `docs/dev/comanda/cierre-del-modulo.md`.

| Familia | Comando / chequeo | Resultado |
|---------|-------------------|-----------|
| C API | `env -u DATABASE_URL pnpm --filter @restaurante/api test` | 210 pasó, 22 skipped |
| C API | `pnpm --filter @restaurante/api typecheck` | Pasó |
| C Web | `pnpm --filter @restaurante/web test` | 36 pasó |
| C Web | `pnpm --filter @restaurante/web typecheck` | Pasó |
| T DB | `select 1` + `\dt` | 1; 6 tablas (menú+órdenes) |
| T DB | `pnpm --filter @restaurante/api test:db` | 22 pasó |
| T Health | `/health`, `/health/database` | ok |
| T Sistema | home + `/menu` `/orders` `/kitchen` | 200, tres enlaces en home |
| B1–B22 | Recorrido §7 | Todos pasaron (tabla arriba) |
| Orden demo | Mesa `D2-1` | `1fd99515-1043-4af9-b5ac-01e73ef7f2ae` READY |

**Deuda:** CSS de comandas/cocina copiado del menú hasta la UI final.

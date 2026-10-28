# Plan de acción — Tarea 3 · Pantalla admin y demo (E1)

**Rama:** `dev/menu`  
**Épica:** E1 Menú (RF1). Tarea 3 de 3. Solo esta. Cierra el demo del Sprint 1.  
**Fecha:** 30 de septiembre de 2026  
**Estado:** cerrado el 30 de septiembre de 2026.  
**Análisis:** `analisis.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Resultado

En `http://localhost:3000/menu` se lista el catálogo que devuelve `GET /menu-items`, se crea, se edita, se desactiva y se vuelve a activar. El precio que viaja son centavos. El impuesto que viaja son puntos base. Un fallo de red no dibuja platos. Escritorio y un viewport de 390 px de ancho se usan sin desplazamiento horizontal.

## 2. No se toca

- `apps/api/**`, salvo correr otra vez sus tests al final para ver que siguen verdes.
- El plato `d11d0b9f-dd9b-4010-b0fe-1ad1a63a62fa`. No se borra para vaciar la tabla.
- Reglas de dinero, tasa, modificador y casos de uso.
- Órdenes, cocina, totales, cobro.

## 3. Decisiones

| Tema | Decisión |
|------|----------|
| Ruta | `/menu` |
| Datos | `fetch` del navegador a `NEXT_PUBLIC_API_URL`. Sin Route Handler que oculte el API |
| URL ausente | Mensaje en pantalla. Sin fallback escrito en el código |
| Lista | La última respuesta 200 de `GET`. Tras crear, editar, desactivar o activar, se vuelve a pedir |
| Alta | Cuerpo sin `id` y sin `active` |
| Edición | El id de la ruta es el de la fila elegida. El cuerpo lleva `active` y los modificadores nuevos, sin sus ids |
| Baja | `POST /menu-items/:id/deactivate` con `{}` |
| Reactivar | `PATCH` con los datos del formulario y `active: true` |
| Precio en pantalla | `$` + pesos con dos decimales, solo lectura |
| Precio en el formulario | Texto de pesos. A centavos con enteros. Sin `parseFloat` y sin `* 100` en `number` |
| Impuesto | Etiqueta «Impuesto (%)». `16` se envía como `1600` |
| Extra | Se envía `price` |
| Exclusión | El JSON no incluye `price` |
| Vacío | Función pura de la vista, testeada sin browser. En esta base el listado no está vacío |
| Estilos | CSS de esta ruta. Sin librería de UI |
| Ancho estrecho | Por debajo de 40 rem, una columna |

## 4. Capas

- **Dominio y aplicación:** igual.
- **API:** igual. La pantalla solo llama los cuatro endpoints.
- **Web:** conversión de texto, cliente HTTP, estado de la vista, formulario y listado.

## 5. Pasos

### Paso 1 — Enteros de presentación

Archivos:

- `apps/web/app/menu/menu-amount.ts`
- `apps/web/app/menu/menu-amount.spec.ts`

Funciones puras:

- `centavosToLabel(amount: number): string` — `4500` → `$45.00`, `5` → `$0.05`, `0` → `$0.00`. Parte entera con división entera. No usa `amount / 100` como número que luego se redondea.
- `pesosToCentavos(input: string): number` — entero, o lanza un error local si el texto no cumple el análisis.
- `basisPointsToPercentLabel(basisPoints: number): string` — `1600` → `16.00 %`.
- `percentToBasisPoints(input: string): number` — `16.5` → `1650`.
- `catalogView(status): 'loading' | 'error' | 'empty' | 'list'`

Vitest en `@restaurante/web`, script `test`. Solo este archivo. No se arrastra el runner hacia componentes.

### Paso 2 — Cliente HTTP

Archivo `apps/web/app/menu/menu-api.ts`.

- Lee `process.env.NEXT_PUBLIC_API_URL`. Si falta o está en blanco, lanza un error de configuración antes del `fetch`.
- `listMenuItems`, `createMenuItem`, `updateMenuItem`, `deactivateMenuItem`.
- El JSON de alta y de edición lo arma el llamador con los enteros del paso 1. Este módulo no convierte pesos.
- Si `response.ok` es falso, lee `{ code, message }` cuando el cuerpo sea ese objeto. Si no, error con el status, sin inventar un `code` de dominio.
- Tipos del JSON alineados al presentador: `price` del modificador es el objeto o `null`.

### Paso 3 — Pantalla

Archivos:

- `apps/web/app/menu/page.tsx` — renderiza el screen.
- `apps/web/app/menu/menu-admin-screen.tsx` — `'use client'`.
- `apps/web/app/menu/menu-admin.module.css`

Comportamiento:

1. Al montar, `GET`. Estados `loading`, `error`, `empty`, `list` según `catalogView`.
2. El error de carga muestra `code` y `message`, y un botón «Reintentar».
3. El vacío invita a crear el primer plato y deja el formulario de alta visible.
4. Cada fila muestra nombre, `centavosToLabel`, `basisPointsToPercentLabel`, «Activo» o «Inactivo», y los modificadores en orden. La exclusión se lee «sin cargo», no como `$0.00`.
5. «Editar» copia esa fila al formulario. «Cancelar» vuelve a modo alta.
6. El formulario: nombre, precio en pesos, impuesto en porcentaje, lista de modificadores (agregar, quitar, tipo, nombre, precio del extra), y casilla de activo solo en edición.
7. Validación local de la sección 6 antes del `fetch`. Si falla, no cambia la lista.
8. Envío deshabilitado hasta que la respuesta termina.
9. Alta exitosa: `GET` de nuevo y el formulario vuelve a vacío, en modo alta.
10. Edición exitosa: `GET` de nuevo.
11. «Desactivar» en una fila activa llama al endpoint de baja y luego `GET`. No se ofrece en una fila inactiva.
12. «Activar» guarda la edición con `active: true`.
13. Si el `GET` posterior falla, se reemplaza la lista por el estado de error. No se conserva la lista anterior como si el servidor la hubiera confirmado.

`apps/web/app/page.tsx` agrega el enlace a `/menu`. `menu-admin-screen.tsx` enlaza a `/`.

CSS: texto en español, botones y campos con tamaño cómodo, fila inactiva distinguible, lista y formulario en columna cuando el ancho es menor a 40 rem. Sin marco horizontal.

### Paso 4 — Verificación

1. `pnpm --filter @restaurante/web test` — catálogo A.
2. `pnpm --filter @restaurante/web typecheck` y `pnpm --filter @restaurante/api test` sin `DATABASE_URL`.
3. `pnpm dev:restart`.
4. Recorrido del navegador, sección 8, en ventana ancha y a 390 px de ancho.
5. Anotar el resultado en la sección 9.

## 6. Validación local, antes del fetch

| Campo | No se envía si |
|-------|----------------|
| Nombre | Tras `trim` queda vacío |
| Precio | `pesosToCentavos` lanza |
| Impuesto | `percentToBasisPoints` lanza |
| Modificador | Nombre vacío, `kind` que no sea `extra` o `exclusion`, extra con precio inválido |

Mensaje junto al formulario, en español, diciendo el campo. Esto no sustituye el 422: si el API rechaza igual, se muestran `code` y `message` y los campos se quedan como los dejó la persona.

Cuerpo de un extra: `{ name, kind: "extra", price: { amount, currency: "MXN" } }`.  
Cuerpo de una exclusión: `{ name, kind: "exclusion" }`.

## 7. Catálogo sin navegador

| Id | Entrada | Entonces |
|----|---------|----------|
| A1 | `4500` | `$45.00` |
| A2 | `5` y `0` | `$0.05` y `$0.00` |
| A3 | `45`, `45.5`, `45.50` | `4500`, `4550`, `4550` |
| A4 | `""`, `45.505`, `-1`, `45,50` | cada uno rechazado, sin número |
| A5 | `1600` | `16.00 %` |
| A6 | `16`, `16.5`, `0` | `1600`, `1650`, `0` |
| A7 | estado cargando, error, arreglo vacío, arreglo de un plato | `loading`, `error`, `empty`, `list` |

A4 no produce un entero por accidente de `parseFloat`.

## 8. Recorrido en el navegador

Con API y web recién reiniciados. Anotar pasó o falló por ítem.

| Id | Qué hacer | Entonces |
|----|-----------|----------|
| B1 | Abrir `/` y seguir «Administrar menú» | Llega a `/menu` |
| B2 | Mirar la carga | Se ve el texto de carga y no un plato inventado |
| B3 | Listado real | Aparece `Tacos de suadero` inactivo, con precio e impuesto legibles y sus modificadores. La exclusión no dice `$0.00` |
| B4 | Crear «Quesadilla», `32.50`, impuesto `16`, extra «Queso» `10` y exclusión «Sin cebolla» | La fila queda activa. Precio `$32.50`. Impuesto `16.00 %`. Extra y luego exclusión |
| B5 | Editar esa quesadilla: nombre «Quesadilla grande» | El listado muestra el nombre nuevo. El id no cambia (se puede ver en la respuesta de red o volviendo a pedir el `GET`) |
| B6 | Desactivar la quesadilla | Sigue en la lista, inactiva. No hay botón de desactivar otra vez en esa fila |
| B7 | Editarla y activarla | Vuelve a «Activo» |
| B8 | Intentar crear con nombre vacío y con precio `12.999` | Mensaje local. En la red no sale ese `POST` |
| B9 | Crear con precio `0` e impuesto `0` y sin modificadores, si el API está arriba | 201 y fila en `$0.00` e impuesto `0.00 %`. Si esto no se prueba, no se deja implícito |
| B10 | Parar la API y reintentar el listado | Mensaje de error y ninguna tarjeta nueva. «Reintentar» con la API ya prendida vuelve a mostrar las filas reales |
| B11 | Ancho de escritorio y 390 px | Una columna en el estrecho. Crear y desactivar se alcanzan. Sin scroll horizontal |
| B12 | Volver a `/` | La home sigue con «Sistema de Pedidos» |

B3 depende de la fila de la tarea 2. Si esa fila ya no está, se anota y el vacío sí se ve en pantalla; no se inserta un sustituto a mano para cumplir la tabla.

## 9. Hecho cuando

- [x] A1–A7 pasan
- [x] B1–B12 anotados con fecha, en escritorio y en 390 px
- [x] `pnpm --filter @restaurante/api test` sigue pasando sin `DATABASE_URL`
- [x] Typecheck de web y de api pasan
- [x] Ningún archivo de `apps/web` calcula un total de orden ni importa Drizzle
- [x] `apps/api` no cambió por esta tarea

Al cerrar, tabla en este archivo: comando de tests, y cada B con pasó o falló. El id del plato creado en B4 se anota, igual que se anotó el de la tarea 2.

## 10. Cierre — 30 de septiembre de 2026

| Familia | Comando | Resultado |
|---------|---------|-----------|
| A | `pnpm --filter @restaurante/web test` | Pasó. 2 archivos, 14 pruebas. A1–A7 van en las 7 de `menu-amount.spec.ts` |
| API | `env -u DATABASE_URL pnpm --filter @restaurante/api test` | Pasó. 12 archivos y 66 pruebas. 1 archivo y 8 pruebas skipped: la suite de base no corre sin `MENU_REPOSITORY_INTEGRATION=1` |
| Typecheck | `pnpm --filter @restaurante/web typecheck` y `pnpm --filter @restaurante/api typecheck` | Pasaron |

`apps/api` no tiene diff de esta tarea. En `apps/web` no hay import de Drizzle ni un total de orden.

Recorrido con `pnpm dev:restart`, escritorio de 1280 px y ventana de 390 px. Fecha: 30 de septiembre de 2026.

| Id | Resultado |
|----|-----------|
| B1 | Pasó. Desde `/`, «Administrar menú» llega a `/menu` |
| B2 | Pasó. Se vio «Cargando el menú…» y todavía no el plato |
| B3 | Pasó. `Tacos de suadero` inactivo, `$45.00`, `16.00 %`, extra `$15.00`, exclusión «sin cargo» |
| B4 | Pasó. Alta 201. Fila activa, `$32.50`, `16.00 %`, extra y luego exclusión |
| B5 | Pasó. El listado dice «Quesadilla grande» y el id no cambió |
| B6 | Pasó. Sigue en la lista, inactiva, sin «Desactivar» en esa fila |
| B7 | Pasó. Tras editar y activar vuelve a «Activo» |
| B8 | Pasó. Nombre vacío y precio `12.999` muestran mensaje local. No salió `POST` |
| B9 | Pasó. 201. Fila «Agua» en `$0.00` e impuesto `0.00 %`, sin modificadores |
| B10 | Pasó. Con la API parada: «No se pudo contactar el API.» y «Reintentar», sin tarjetas. Al prenderla, «Reintentar» muestra las filas reales |
| B11 | Pasó. A 1280 px, dos columnas y sin scroll horizontal. A 390 px, una columna; crear y desactivar se alcanzan; sin scroll horizontal |
| B12 | Pasó. `/` sigue con «Sistema de Pedidos» |

B4 creó `0add2209-bcf4-499c-81a6-8663dcd5572f`. Tras B5–B7 quedó con nombre `Quesadilla grande` y activo. B9 creó `b2770e49-eaac-4d62-b73e-6a0cab36ec4c`, nombre `Agua`, precio 0 y tasa 0. El plato de la tarea 2, `d11d0b9f-dd9b-4010-b0fe-1ad1a63a62fa`, sigue inactivo.

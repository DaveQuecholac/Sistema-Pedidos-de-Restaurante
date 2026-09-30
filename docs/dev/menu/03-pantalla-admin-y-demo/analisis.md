# Análisis — Tarea 3 · Pantalla admin y demo (E1)

**Rama:** `dev/menu`  
**Épica:** E1 Menú (RF1). Tarea 3 de 3. Solo esta.  
**Fecha:** 30 de septiembre de 2026  
**Estado:** análisis para acuerdo. No cambia código.  
**Plan:** `plan-de-accion.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.  
**Base:** el HTTP que ya cerró la tarea 2 el 30 de septiembre de 2026, no un contrato dibujado de nuevo.

Esta tarea cierra el Sprint 1: entrar a la web, administrar el catálogo y ver el cambio. No agrega reglas de plato ni endpoints.

## 1. Qué ya responde la API

`MenuItemController` en `/menu-items`. CORS abierto. La web llama con `NEXT_PUBLIC_API_URL` (`apps/web/.env.example` ya dice `http://localhost:3001`).

| Acción | Petición | Éxito |
|--------|----------|-------|
| Crear | `POST /menu-items` | 201 y el plato. El cuerpo no lleva `id` ni `active` (Zod `.strict()` lo rechaza con 400) |
| Listar | `GET /menu-items` | 200 y un arreglo, activos e inactivos. Puede ir vacío. No viene dentro de `{ data }` |
| Editar | `PATCH /menu-items/:id` | 200. El id va en la ruta. El cuerpo lleva `active` y la lista completa de modificadores, sin ids de modificador |
| Desactivar | `POST /menu-items/:id/deactivate` | 200. El cuerpo es `{}`. La segunda vez sigue en 200 con `active: false` |

Un plato en JSON:

- `price`: `{ amount, currency }`. `amount` son centavos enteros. `currency` es `MXN`.
- `applicableTax.basisPoints`: `1600` significa 16 %. No es el impuesto de una orden.
- Modificador `extra`: `price` con centavos. `exclusion`: `"price": null`.
- El orden del arreglo es el orden guardado (`position`).

Errores, siempre `{ code, message }`, sin SQL ni stack:

| HTTP | `code` |
|------|--------|
| 400 | `InvalidRequest` |
| 422 | `BlankNameError`, `BlankIdError`, `InvalidMoneyError`, `InvalidTaxRateError`, `InvalidModifierKindError`, `ExtraMissingPriceError`, `ExclusionHasPriceError` |
| 404 | `MenuItemNotFoundError` |
| 409 | `MenuItemAlreadyExistsError` |
| 500 | `MenuItemMappingError` u otro fallo |

No hay `GET /menu-items/:id`. El formulario de edición sale de la fila que ya trajo el listado.

La base no está vacía. El smoke de la tarea 2 dejó el plato `d11d0b9f-dd9b-4010-b0fe-1ad1a63a62fa`, nombre `Tacos de suadero`, inactivo. La demo lo muestra. No se borra para fabricar el estado vacío.

## 2. Qué pide la pantalla

Tarjeta del sprint: listado, formulario de crear y editar, modificadores, vacío, error, usable en escritorio y en celular. La demo anota el recorrido.

La web es un adaptador. Muestra lo que devolvió el API y le manda comandos. No decide si un extra es válido, no calcula la cuenta y no guarda un catálogo local si la petición falla.

Hoy `apps/web` solo tiene la home. No hay ruta `/menu`, ni CSS, ni cliente HTTP.

## 3. Qué se ve

Ruta `/menu`. En la home, un enlace «Administrar menú». En el admin, un enlace de vuelta a `/`.

Tres situaciones de carga, distintas entre sí:

| Situación | Qué se muestra |
|-----------|----------------|
| Todavía no hay respuesta | Texto de carga. Ni lista inventada ni formulario bloqueado con datos falsos |
| `GET` falla o no hay `NEXT_PUBLIC_API_URL` | El error. Un botón para volver a pedir. Cero platos pintados de memoria |
| `GET` 200 y arreglo vacío | Invitación a crear el primer plato |
| `GET` 200 con filas | Cada plato: nombre, precio legible, impuesto legible, activo o inactivo, modificadores en el orden recibido |

El precio se lee como pesos (`4500` → `$45.00`) y el impuesto como porcentaje (`1600` → `16.00 %`). Ese texto no se reenvía. Al guardar se mandan centavos y puntos base.

El formulario sirve para alta y para edición:

- Alta: no envía `active`. El API crea el plato activo.
- Edición: elige un plato del listado, muestra sus datos y envía `active`. Así se puede volver a activar el inactivo que ya está en la base. Desactivar sigue siendo el `POST …/deactivate`, no un parche a medias.
- Modificadores: filas con nombre, tipo extra o exclusión, y precio solo en el extra. El orden de las filas es el orden del JSON. No se mandan ids de modificador: el API los regenera.
- Se puede guardar con cero modificadores.

Mientras una petición va en curso, el envío se deshabilita. Al éxito, se vuelve a pedir `GET`. La lista que queda en pantalla es la última respuesta del API, no una copia optimista. Si ese segundo `GET` falla, se dice; no se deja una lista que el servidor no confirmó.

## 4. Centavos y porcentaje, sin `float`

El riesgo de esta pantalla es `45.00 * 100` o `16.5 * 100` en punto flotante. La conversión es de texto a enteros, en el adaptador web, y solo arma el cuerpo. No es una regla de negocio.

Precio escrito por la persona, después de `trim`:

- Válido: uno o más dígitos, y como máximo dos decimales. `45`, `45.5`, `45.50`, `0.05`.
- Centavos = parte entera × 100 + decimales rellenados a dos cifras, todo con enteros.
- Inválido y no se envía: vacío, `45.505`, `-1`, `45,50`, `MXN` pegado al número.

Impuesto escrito como porcentaje:

- Misma forma numérica.
- Puntos base = parte entera × 100 + decimales rellenados a dos cifras. `16` → `1600`. `16.5` → `1650`. `0` → `0`.
- La etiqueta dice porcentaje, para no teclear `1600` creyendo que el campo ya son puntos base.

Si el entero es válido de forma y el dominio igual lo rechaza (fuera de rango), el API responde 422 y la pantalla muestra `code` y `message`. El cliente no adelanta ese tope con otra regla paralela.

## 5. Errores en la pantalla

| Origen | Comportamiento |
|--------|----------------|
| Nombre vacío, precio mal escrito, porcentaje mal escrito, extra sin precio, exclusión con un precio tecleado que el formulario aún tiene | Mensaje local. No hay `fetch` |
| 400, 404, 409, 422, 500 con `{ code, message }` | Se muestran los dos campos. El formulario no se vacía, para poder corregir |
| Respuesta sin JSON | Mensaje de fallo de red o de cuerpo ilegible, con el status si existe |
| Variable de entorno ausente | Mensaje fijo. No se inventa `http://localhost:3001` dentro del código |

La exclusión, al ser de ese tipo, no incluye la clave `price` en el JSON. Si se enviara, el API responde `ExclusionHasPriceError`.

## 6. Capas

- **Dominio, aplicación, Drizzle, Zod y controllers:** no se modifican. El contrato de la sección 1 ya es el de producto.
- **Web:** ruta `/menu`, cliente HTTP, conversión de texto a enteros, presentador de pesos y porcentaje, mensajes y CSS propio de esta pantalla.
- La home solo gana el enlace. No calcula nada.

## 7. Demo

El recorrido que anota el cierre, con API y web reales (`pnpm dev:restart` antes, porque un refresh no recarga el proceso de Next):

1. Home → Administrar menú.
2. Ver el plato inactivo que ya existe, con precio e impuesto legibles. Si el `GET` falla, el error se ve y no hay tarjetas inventadas.
3. Crear un plato con precio, impuesto, un extra y una exclusión.
4. Verlo activo en el listado, en ese orden de modificadores.
5. Editarlo y ver el cambio.
6. Desactivarlo y verlo inactivo, sin que desaparezca.
7. Volver a activarlo desde la edición.
8. Provocar un dato inválido que igual se llega a enviar, o un error local, y leer el mensaje.
9. Escritorio y ancho de celular (una columna, se puede crear y desactivar sin scroll horizontal).

El estado vacío es una rama real del código. En esta base no sale a la vista porque ya hay una fila. Se cubre con una función pura del estado de la vista, probada sin navegador: arreglo vacío → vacío; arreglo con filas → listado; fallo → error. El navegador cubre carga, listado, formulario y error de API.

## 8. Fuera de esta tarea

- Endpoints nuevos, cambios de esquema, seeds que borren `Tacos de suadero`.
- Totales de orden, propina, cocina, cobro, login.
- Librería de componentes o un design system.
- Tests de dominio repetidos. Las 66 pruebas de la API se vuelven a correr para ver que siguen, no para ampliarlas.

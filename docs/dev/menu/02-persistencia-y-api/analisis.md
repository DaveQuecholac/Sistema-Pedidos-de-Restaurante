# Análisis — Tarea 2 · Persistencia y API de menú (E1)

**Rama:** `dev/menu`  
**Épica:** E1 Menú (RF1). Tarea 2 de 3. Solo esta.  
**Fecha:** 30 de septiembre de 2026  
**Estado:** análisis para acuerdo. No cambia código.  
**Plan:** `plan-de-accion.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.  
**Base:** el código de la tarea 1, no solo su plan. Cierre de esa tarea: 49 pruebas, 30 de septiembre de 2026.

La pantalla admin sigue siendo la tarea 3. Aquí el menú se guarda en Postgres y se opera por HTTP.

## 1. Qué pide la tarea

Del corte de la épica: guardado real (los datos siguen al reiniciar) y endpoints con errores claros de no encontrado y de datos inválidos.

Eso, sobre el núcleo que ya existe, significa:

- `DrizzleMenuRepository` implementa el puerto `MenuRepository` que ya usan los casos.
- `AppModule` elige ese adaptador. El doble en memoria se queda en los tests.
- HTTP llama a `CreateMenuItem`, `ListMenuItems`, `UpdateMenuItem` y `DeactivateMenuItem`. No reimplementa reglas.

## 2. Contrato que ya está escrito

No se cambia en esta tarea.

| Pieza | Hecho |
|-------|--------|
| `Money.of` | Entero `0` … `2_147_483_647`, moneda exactamente `MXN`. Si no, `InvalidMoneyError` |
| `TaxRate.of` | Mismo rango de enteros. Si no, `InvalidTaxRateError` |
| `Modifier.extra` / `exclusion` | Extra con `Money`. Exclusión con precio `null`. Errores `ExtraMissingPriceError` y `ExclusionHasPriceError` |
| `MenuItem.create` | Siempre activo. Recorta id y nombre. `BlankIdError`, `BlankNameError` |
| `MenuItem.restore` | Misma validación, con `active` explícito. Es la puerta para leer desde la base |
| `MenuItem.replace` | Conserva el id del plato |
| `deactivate` | Si ya está inactivo, devuelve el mismo objeto |
| Puerto | `add` inserta o `MenuItemAlreadyExistsError`. `save` reemplaza o `MenuItemNotFoundError`. `findById` devuelve `null`. `list` no filtra inactivos |
| Casos | Crean los ids con la función inyectada. Editar regenera los ids de modificador y sustituye la lista. Desactivar no escribe si ya estaba inactivo. Un comando inválido no llama a `add` ni a `save` |
| Borrador HTTP-agnóstico | `ModifierDraft`: `kind` string, precio opcional. `toModifier` lanza `InvalidModifierKindError` si el kind no es `extra` ni `exclusion` |

Los casos reciben comandos ya tipados. Quien traduce JSON es el controller. Quien traduce filas es el adaptador. Ninguno de los dos afloja una regla con `|| 0`, `|| 'MXN'` o un precio `0` para “salvar” una exclusión.

## 3. Qué falta para que el guardado sea fiel

La migración `0000` ya tiene las dos tablas y los checks. Hay un hueco respecto al modelo:

Los modificadores viven en un arreglo ordenado. `create` y `replace` conservan el orden del comando. La tabla `menu_item_modifiers` no tiene columna de posición. Un `select` sin `order by` no devuelve ese orden. Al reiniciar, el plato puede volver con el extra y la exclusión cambiados de lugar. Eso rompe el agregado aunque los checks SQL pasen.

Esta tarea agrega `position` (entero `>= 0`) en el esquema, con default `0`, y genera la migración con Drizzle Kit. El default evita romper filas que hayan quedado de las pruebas SQL de E0. El adaptador escribe `0…n-1` y lee con `order by position, id`. No se edita `0000_abnormal_jigsaw.sql` ni el journal a mano.

El orden de la lista de platos no es regla de dominio: el doble lo deja en orden de `add` y el caso no ordena. El adaptador Drizzle puede devolver los platos en un orden estable (`id` ascendente) para que la respuesta no cambie entre lecturas. Eso no obliga a cambiar `InMemoryMenuRepository`.

No hace falta otra columna para el precio nulo de la exclusión: el esquema ya lo exige, y `Modifier.price` ya es `Money | null`.

## 4. Mapeo fila ↔ plato

Solo en `infrastructure`. `restore`, nunca `create`, para no resucitar un inactivo como activo.

| Columna | Modelo |
|---------|--------|
| `id`, `name` | Se entregan a `restore`. El dominio vuelve a recortar. Lo que escriben los casos ya viene recortado |
| `price_amount`, `price_currency` | `Money.of`. Si la moneda no es `MXN`, no se sustituye: falla el mapeo |
| `tax_basis_points` | `TaxRate.of` |
| `active` | Tal cual |
| `kind = extra` | `Modifier.extra` con `Money.of` |
| `kind = exclusion` | `Modifier.exclusion` y precio `null` |
| `position` | Índice del arreglo al escribir. Al leer, orden de la lista |

Si una fila pasa el check SQL y aun así no pasa el dominio (ejemplo real: `price_currency = 'USD'`, longitud 3, el check lo acepta y `Money` no), `findById` y `list` lanzan `MenuItemMappingError`. No se omite la fila ni se devuelve un plato “arreglado”. Un GET de esos datos es fallo del adaptador, no un 422 de validación del cliente.

`add` y `save` van en una transacción. Si falla el insert de una hija, no queda el plato sin sus modificadores ni las hijas del reemplazo a medias. `save` actualiza la fila del plato, borra las hijas de ese id y las vuelve a insertar con los ids nuevos que ya trae el `MenuItem`. Si el `update` no afecta filas, `MenuItemNotFoundError` y la transacción no inserta hijas. Una violación de llave única en `add` es `MenuItemAlreadyExistsError`. Cualquier otro error de Postgres sigue siendo un error de infraestructura, no un error de nombre vacío.

## 5. HTTP

Prefijo de producto: `/menu-items`. El id del plato va en la ruta. El cuerpo no lo trae: el cliente no puede cambiarlo.

| Método | Ruta | Caso |
|--------|------|------|
| `POST` | `/menu-items` | `CreateMenuItem` |
| `GET` | `/menu-items` | `ListMenuItems` |
| `PATCH` | `/menu-items/:id` | `UpdateMenuItem` |
| `POST` | `/menu-items/:id/deactivate` | `DeactivateMenuItem` |

Respuesta de un plato, vocabulario de producto. La exclusión lleva `"price": null`. No se omiten campos ni se mandan nombres de columna.

```json
{
  "id": "…",
  "name": "Tacos al pastor",
  "price": { "amount": 4500, "currency": "MXN" },
  "applicableTax": { "basisPoints": 1600 },
  "active": true,
  "modifiers": [
    {
      "id": "…",
      "name": "Queso extra",
      "kind": "extra",
      "price": { "amount": 1500, "currency": "MXN" }
    },
    {
      "id": "…",
      "name": "Sin cilantro",
      "kind": "exclusion",
      "price": null
    }
  ]
}
```

El listado es un arreglo de esos objetos. Puede ir vacío. No envuelve el arreglo en `{ "data": … }`.

Zod solo mira la forma del JSON: tipos, campos requeridos, objeto estricto. Un monto `1.5` es un número y Zod lo deja pasar; el dominio responde 422. Un monto `"4500"` no es un número y Zod responde 400. Así la regla de negocio no se duplica en el borde y un JSON mal armado no llega al caso.

`kind` llega como string. Si el cliente manda `"EXTRA"` o `"note"`, responde el caso con `InvalidModifierKindError`, no un default a `extra`.

| Situación | HTTP | `code` |
|-----------|------|--------|
| JSON mal formado o campo de tipo incorrecto | 400 | `InvalidRequest` |
| `BlankNameError`, `BlankIdError`, `InvalidMoneyError`, `InvalidTaxRateError`, `InvalidModifierKindError`, `ExtraMissingPriceError`, `ExclusionHasPriceError` | 422 | el `name` de la clase |
| `MenuItemNotFoundError` | 404 | `MenuItemNotFoundError` |
| `MenuItemAlreadyExistsError` | 409 | `MenuItemAlreadyExistsError` |
| `MenuItemMappingError` u otro fallo no previsto | 500 | `MenuItemMappingError` o el 500 de Nest, sin SQL y sin stack en el cuerpo |

Cuerpo de error: `{ "code", "message" }`. El `message` es el texto fijo de la clase de dominio o de aplicación. No se concatena el valor que mandó el cliente ni el detalle del driver.

`GET /health` y `GET /health/database` no cambian.

El composition root inyecta `crypto.randomUUID` como `generateId` de crear y editar. Los tests HTTP no usan esa función: arman un módulo mínimo, como ya hace el spec de `/health/database`, con el doble en memoria y un generador fijo. Así los códigos HTTP se prueban sin Postgres.

## 6. Capas

- **Dominio:** sin archivos nuevos y sin cambios de reglas.
- **Aplicación:** se agrega `MenuItemMappingError` junto a los errores del puerto. Los cuatro casos no se reescriben.
- **Infraestructura:** columna `position`, mapper, `DrizzleMenuRepository`. El doble en memoria no se importa aquí.
- **HTTP:** Zod, presentador JSON, controller, traducción de errores.
- **Composition root:** `AppModule.register` registra el repositorio Drizzle y los casos. Sigue recibiendo el `AppDatabase` que ya abre `main.ts`.

## 7. Pruebas

Tres familias, para que una no tape a la otra.

1. **Sin Postgres.** El controller contra el doble en memoria: 201, 200, 422, 404, 400, precio `null` en la exclusión, y un inválido no deja un segundo plato en el doble.
2. **Con Postgres.** El adaptador, dentro de una transacción que hace rollback al terminar, para no depender de que la tabla esté vacía y no borrar los platos de otras pruebas. Cubre ida y vuelta, orden por `position`, extra y exclusión, inactivo, `add` duplicado, `save` de un id ausente, y una fila `USD` que el mapeo rechaza.
3. **Sistema.** Con `pnpm dev` y la base real: crear por HTTP, reiniciar la API, leer el mismo id. Health sigue respondiendo.

`pnpm --filter @restaurante/api test` sigue sin exigir `DATABASE_URL`: la familia 2 se salta si no hay URL. La tarea no está hecha si esa familia no se corrió con URL. El script `test:db` la exige y falla si el archivo de integración no ejecutó sus casos.

La pantalla, el vacío visual y el celular no se prueban aquí.

## 8. Fuera de esta tarea

- Cualquier componente en `apps/web`.
- Cambiar reglas de `Money`, `MenuItem` o de los casos para que el JSON “entre más fácil”.
- Seeds de platillos de demo.
- Borrado físico, login, órdenes, totales, cobros.
- Reescribir `docs/desarrollo/pruebas-cttm.md`. Al cerrar, el resultado queda en el plan de esta tarea.

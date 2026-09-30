# Análisis — Tarea 1 · Modelo y operaciones de menú (E1)

**Rama:** `dev/menu`  
**Épica:** E1 Menú (RF1). Tarea 1 de 3. Solo esta.  
**Fecha:** 30 de septiembre de 2026  
**Estado:** análisis para acuerdo. No cambia código.  
**Plan:** `plan-de-accion.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

Las otras dos tareas de esta épica (persistencia con API, y pantalla con demo) no se diseñan aquí como trabajo a implementar. Sí se deja el contrato que tienen que poder cumplir sin cambiar las reglas.

## 1. Qué pide la tarea

Administrar el catálogo en el núcleo, probado sin pantalla y sin Postgres.

- Plato con precio e impuesto aplicable.
- Modificador extra o exclusión.
- Operaciones: crear, listar, editar y desactivar.
- Pruebas de reglas y de casos de uso con un repositorio en memoria.

RF1 del enunciado: menú con platos, modificadores (extra o exclusiones), precios e impuestos aplicables. El plan de sprints parte eso en modelo, guardado, API y pantalla. Esta tarea es el modelo y las operaciones.

## 2. Qué ya dejó la épica E0

`dev/plataforma` está mergeada en esta rama. Sirve de límite, no de lógica de menú.

| Ya existe | No existe |
|-----------|-----------|
| Tablas `menu_items` y `menu_item_modifiers`, migración Drizzle Kit | `MenuItem`, `Modifier`, `Money`, `TaxRate` |
| Checks de nombre, precio entero `>= 0`, moneda de 3 caracteres, tasa `>= 0`, `kind` `extra` \| `exclusion`, precio según el tipo | `MenuRepository` y los cuatro casos |
| `CheckDatabaseConnection` con puerto falso en Vitest | Endpoints de menú y pantalla `/menu` |
| API que no escucha si Postgres no responde | Registro de menú en `AppModule` |

El dominio de esta tarea tiene que rechazar lo mismo que ya rechaza Postgres, y un poco más donde el producto es más estricto que la columna. Si el dominio deja pasar un objeto que el check SQL rechaza, la tarea de persistencia fallará al guardar un caso que los tests en memoria daban por bueno.

Checks reales del esquema (`apps/api/src/infrastructure/persistence/drizzle/schema/menu.ts`):

- Nombre con texto después de recortar espacios.
- `price_amount` entero SQL `>= 0`. `price_currency` de longitud 3.
- `tax_basis_points` `>= 0`.
- `active` no nulo, default `true` en la columna.
- Extra: `price_amount >= 0` y moneda presente.
- Exclusión: las dos columnas de precio en nulo.
- Hija con FK al plato y borrado en cascada.

Postgres `integer` es int4: el máximo es `2_147_483_647`. El esquema no lo dice en un check, pero un entero JS mayor rompe el `insert` futuro. El dominio lo corta aquí.

La columna de moneda acepta cualquier código de 3 letras. El producto de este sprint usa solo `MXN`. Esa regla vive en el dominio. La base no se migra de nuevo en esta tarea para apretar el check.

## 3. Alcance

Entra: value objects, plato, modificador, puerto `MenuRepository`, cuatro casos de uso, doble en memoria, tests Vitest sin `DATABASE_URL` y sin browser.

No entra:

- `DrizzleMenuRepository`, mapper fila ↔ producto, SQL nuevo.
- Zod, controllers, códigos HTTP.
- Cambios en `apps/web` o en `AppModule`. Estos casos no se inyectan todavía: los tests los construyen a mano. Cablearlos sin endpoint sería un adaptador a medias.
- Totales de orden, descuento, propina, Strategy de impuesto de cuenta (RF4). La tasa del plato solo se guarda.
- Borrado físico, login, duplicar nombres como error, catálogo de extras separado del plato.

## 4. Modelo

Nombres de código en inglés, como el maestro. En producto se habla de plato y modificador; en tipos, de `MenuItem` y `Modifier`.

| Tipo | Rol |
|------|-----|
| `Money` | `amount` entero en centavos, `currency` exactamente `MXN`. Sin `float` |
| `TaxRate` | `basisPoints` entero `>= 0`. `1600` = 16 %. No calcula una cuenta |
| `Modifier` | `extra` con `Money`, o `exclusion` sin precio |
| `MenuItem` | Id, nombre, precio, tasa, modificadores, `active` |

El plato es el dueño de sus modificadores. No hay modificador guardado fuera de un plato.

Inmutables. Crear, editar y desactivar devuelven otro valor. El arreglo de modificadores que sale del objeto es una copia: quien lo reciba no altera el plato.

Identidad:

- El id del plato lo genera el caso de uso y no cambia al editar ni al desactivar.
- El id de cada modificador también lo genera el caso de uso.
- Al editar, la lista de modificadores se sustituye entera y los ids de modificador son nuevos. No hay “editar el extra 3” en esta tarea. La persistencia podrá borrar hijas e insertar las nuevas, que es lo que ya permite la FK.

`active` nace en `true`. Crear no acepta un plato inactivo. Editar sí puede dejarlo activo o inactivo. Desactivar solo pasa a `false`.

## 5. Reglas y errores

Cada regla falla con un error de dominio, sin status HTTP y sin texto de driver ni de SQL. El nombre de la clase es el contrato del test.

| Condición | Error |
|-----------|--------|
| Id vacío o solo espacios | `BlankIdError` |
| Nombre vacío después de `trim` | `BlankNameError` |
| Monto no entero, `NaN`, negativo, o mayor que `2_147_483_647` | `InvalidMoneyError` |
| Moneda distinta de `MXN` (incluye minúsculas y códigos de 3 letras que no sean ese) | `InvalidMoneyError` |
| Puntos base no enteros, negativos, o mayores que `2_147_483_647` | `InvalidTaxRateError` |
| Extra sin precio | `ExtraMissingPriceError` |
| Exclusión con precio (aunque el monto sea 0) | `ExclusionHasPriceError` |
| `kind` que no sea `extra` o `exclusion` | `InvalidModifierKindError` |

Precio `0` y tasa `0` son válidos. La base los acepta. Un extra gratis es un extra con precio, no una exclusión.

El nombre se guarda recortado. `"  Tacos  "` queda `"Tacos"`. El nombre puede repetirse entre platos. El id no.

Dos modificadores del mismo plato pueden llamarse igual. Lo que no pueden es compartir id: el generador entrega ids distintos.

## 6. Casos de uso

Puerto `MenuRepository`, en lenguaje de dominio:

| Método | Efecto | Falla |
|--------|--------|-------|
| `add(item)` | Alta | `MenuItemAlreadyExistsError` si ese id ya está |
| `save(item)` | Reemplazo del plato ya existente, modificadores incluidos | `MenuItemNotFoundError` si el id no está |
| `findById(id)` | El plato o `null` | No lanza por ausencia |
| `list()` | Todos, activos e inactivos, sin orden de negocio | — |

`add` y `save` están separados para que un alta no pise un id y una edición no cree uno nuevo por descuido. El doble en memoria y, después, Drizzle, implementan esos dos caminos. Esta tarea solo construye el doble.

El generador de ids entra por constructor (`() => string`). El test lo controla. No es un puerto de infraestructura: no hay SDK. Producción, cuando la tarea de API los conecte, puede pasar `crypto.randomUUID`. Esta tarea no toca el módulo Nest.

### `CreateMenuItem`

Entrada: nombre, precio, tasa, lista de modificadores (puede ir vacía). Sin id y sin `active`.

1. Genera el id del plato y un id por modificador.
2. Construye el `MenuItem` activo. Si una regla de la sección 5 falla, no llama a `add`.
3. `add`. Si el id ya existe, `MenuItemAlreadyExistsError` y el repositorio queda como estaba.

Salida: el plato guardado.

### `ListMenuItems`

Sin entrada. Devuelve `list()` tal cual. No filtra inactivos ni reordena. Lista vacía es `[]`, no un error.

### `UpdateMenuItem`

Entrada: id del plato, nombre, precio, tasa, `active`, lista completa de modificadores nuevos (sin ids).

1. `findById`. Si no está, `MenuItemNotFoundError` y no llama a `save`.
2. Genera ids nuevos de modificador y construye el reemplazo. Si la regla falla, no llama a `save`.
3. `save` con el mismo id de plato.

Sirve para corregir datos y para volver a activar (`active: true`). No es el camino de “borrar el plato”.

### `DeactivateMenuItem`

Entrada: id.

1. Si no está, `MenuItemNotFoundError` y no llama a `save`.
2. Si ya está inactivo, devuelve el mismo plato y no llama a `save`.
3. Si está activo, guarda la copia con `active: false`. Nombre, precio, tasa y modificadores siguen.

Desactivar dos veces no cambia el segundo resultado y no vuelve a escribir.

## 7. Pruebas

Todas con Vitest, el script que ya existe (`pnpm --filter @restaurante/api test`), sin `DATABASE_URL` y sin navegador. El doble vive junto a los specs. No se importa desde `infrastructure/persistence/drizzle`.

Familias:

- Value objects: válido, frontera `0`, frontera `2_147_483_647`, un paso más allá, negativo, decimal, `NaN`, moneda mal escrita.
- Modificador y plato: combinaciones de la sección 5, copia defensiva del arreglo, desactivar un inactivo.
- Cada caso de uso: feliz, no escribe si la regla falla, no encontrado, id repetido en el alta, desactivar dos veces, listar mezcla activos e inactivos, editar sustituye modificadores y conserva el id del plato.
- El caso y su spec no importan `drizzle-orm`, `postgres`, `@nestjs/*` ni módulos de `infrastructure/`.

La guía `docs/desarrollo/pruebas-cttm.md` en esta tarea solo aplica al frente de código (tests de unidad y typecheck). Integración con Postgres y sistema con navegador son de las tareas siguientes. No se marcan como fallo de esta.

## 8. Capas

- **Dominio:** `Money`, `TaxRate`, `Modifier`, `MenuItem` y los errores de la sección 5. Sin Nest, Drizzle, HTTP, Zod ni SQL.
- **Aplicación:** puerto `MenuRepository`, errores de no encontrado y de id duplicado, los cuatro casos. Reciben el puerto y el generador por constructor.
- **Adaptador de esta tarea:** solo el doble en memoria, usado por los tests. No es el adaptador de producto.
- **HTTP, Drizzle de menú y web:** no se tocan.
- **Composition root:** `AppModule` sigue cableando únicamente el health de base.

## 9. Qué hereda la tarea de persistencia

Sin cambiar estas reglas, esa tarea tendrá que:

- Implementar `add` como insert y `save` como reemplazo del plato y de sus hijas.
- Guardar exclusión con precio nulo y extra con centavos y `MXN`.
- Devolver `null` en el precio de la exclusión. No rellenar `0`.
- Tratar una fila ya existente que viole el dominio (moneda distinta de `MXN`, por ejemplo) como fallo de mapeo, no como plato reparado en silencio.

Eso no se implementa ahora.

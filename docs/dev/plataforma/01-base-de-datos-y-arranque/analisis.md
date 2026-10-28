# Análisis — Tarea 1 · Base de datos y arranque (E0)

**Rama:** `dev/plataforma`  
**Tarea:** 1 de 4 del Sprint 1. Solo esta.  
**Fecha:** 30 de septiembre de 2026  
**Estado:** análisis para acuerdo. No cambia código.  
**Plan:** `plan-de-accion.md` en esta carpeta.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

Esta carpeta no cubre el modelo de menú, ni los casos de uso de platos, ni la API de menú, ni la pantalla. Esas son las tareas 2, 3 y 4. Aquí se analiza qué tiene que quedar verdad para que esas tareas puedan guardar datos sin rehacer la base.

## 1. Qué pide la tarea

Tarjeta del plan de sprints: **Preparar base de datos y conexión del sistema.**

Checklist de esa tarjeta:

- Conexión a base de datos lista.
- Tablas del menú creadas.
- Arranque de API y web sin errores.
- Smoke básico OK.

Épica: **E0 Plataforma**. Requisito de producto que esas tablas preparan: RF1. Los casos de RF1 no se implementan en esta tarea.

## 2. Estado real

| Hecho | Falta |
|-------|--------|
| API Nest en `:3001` y web Next en `:3000`, arranque con `pnpm dev` | Drizzle, `drizzle-kit` y el driver de Postgres no están en `apps/api/package.json` |
| `GET /health` responde `{ status: "ok", service: "restaurante-api" }` | Ese health no mira la base. Un proceso arriba no demuestra conexión |
| `apps/api/.env.example` ya define `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/restaurante` y `PORT=3001` | La API no carga ese archivo. `main.ts` solo lee `process.env.PORT` |
| PM2 fija `PORT=3001` y `NODE_ENV=development` en `ecosystem.config.cjs` | PM2 no inyecta `DATABASE_URL` |
| `infrastructure/persistence/drizzle/index.ts` es un comentario vacío | No hay esquema, no hay migración, no hay cliente |
| No hay runner de tests | No hay forma de probar un fallo de conexión sin Postgres ni navegador |

Consecuencia: hoy `pnpm dev` puede verse “bien” aunque no exista la base. Esta tarea cierra ese hueco.

## 3. Caso de uso de esta tarea

Uno. No es de menú.

| Caso | `CheckDatabaseConnection` |
|------|---------------------------|
| Intención | Saber si la API puede hablar con Postgres |
| Puerto | `DatabaseHealthPort.ping(): Promise<void>` |
| Éxito | La base responde |
| Fallo | No hay URL, la URL no conecta, o la base rechaza la sesión |

Quién lo llama:

1. El composition root, antes de aceptar tráfico. Si el ping falla, el proceso no se queda “arriba” mintiendo.
2. `GET /health/database`, para el smoke. Traduce el resultado a HTTP. El controller no abre Postgres.

`GET /health` se queda como está: el proceso responde. No se le mezcla el estado de la base, para no perder el chequeo de “la API arrancó”.

No hay otro caso de uso en esta tarea. `CreateMenuItem`, `ListMenuItems`, `UpdateMenuItem` y `DeactivateMenuItem` se analizan abajo solo para que el esquema los pueda sostener. Sus clases, su puerto `MenuRepository`, su HTTP y su pantalla se escriben en las tareas siguientes.

## 4. Qué tienen que poder guardar las tablas

El maestro fija los nombres de código y el plan de sprints fija las operaciones. El enunciado no fija moneda ni la forma del impuesto. Para crear columnas ahora, este análisis cierra un mínimo. Si una fila no se acepta, se cambia antes de migrar.

| Dato de RF1 | Cómo se guarda | Por qué así |
|-------------|----------------|-------------|
| Identidad del plato | `text`, la pone la aplicación en la tarea 2 | El dominio no depende de `gen_random_uuid` de Postgres |
| Nombre | `text` no nulo | Un plato sin nombre no es un plato |
| Precio | Entero en centavos + moneda `text` | `Money` no usa `float`. `4500` + `MXN` = $45.00 |
| Impuesto aplicable | Entero de puntos base | `1600` = 16 %. Es tasa de catálogo, no el impuesto de una orden (eso es RF4) |
| Activo | `boolean` no nulo, default `true` | Desactivar no borra la fila |
| Modificador | Tabla hija, no columnas sueltas en el plato | Un plato tiene cero o varios |
| Tipo | `extra` o `exclusion` | El RF1 solo tiene esos dos |
| Precio del extra | Entero + moneda, nulos en la exclusión | La exclusión no cobra |

Moneda del MVP: `MXN`. La columna existe para no hardcodearla en el tipo SQL.

### Caso `CreateMenuItem` (tarea 2; la base solo lo habilita)

Alta de un plato activo con precio, tasa y modificadores.

La base tiene que aceptar en una sola unidad de trabajo:

- Una fila de plato con precio e impuesto.
- Cero filas hijas.
- Una hija `extra` con precio.
- Una hija `exclusion` con precio nulo.

Tiene que rechazar, por restricción, una exclusión con precio y un extra sin precio. Si eso se deja “para el dominio y ya”, una tarea futura puede saltarse el caso de uso y dejar basura. Las dos barreras se documentan: el dominio valida en la tarea 2; la base no acepta la combinación inválida desde esta tarea.

### Caso `ListMenuItems` (tarea 2)

Devuelve activos e inactivos. La tabla no filtra por `active` en una vista. No hace falta tabla de “archivados”.

### Caso `UpdateMenuItem` (tarea 2)

Reemplaza nombre, precio, tasa, `active` y la lista de modificadores del mismo `id`. Los modificadores viejos se pueden borrar y volver a insertar (el plato es el dueño). Hace falta la llave del plato y una llave foránea de las hijas hacia el plato, con borrado en cascada para esa reescritura.

### Caso `DeactivateMenuItem` (tarea 2)

Pone `active` en falso y deja nombre, precio, tasa y modificadores. No existe `DELETE` de producto en el sprint. La tabla no debe exigir un borrado físico para “dar de baja”.

### Lo que las tablas no modelan

Órdenes, líneas, cocina, totales de cuenta, pagos. Crear esas tablas aquí adelanta RF2–RF5.

## 5. Arranque

| Proceso | Condición de “sin errores” |
|---------|----------------------------|
| API | Cargó `apps/api/.env`, hay `DATABASE_URL`, el ping pasa, escucha `PORT` (3001) |
| API sin URL o sin Postgres | Sale con error explícito. No deja el puerto abierto como si todo estuviera bien |
| Web | `pnpm dev` levanta `:3000` y `/` responde. Esta tarea no le agrega pantallas ni llamadas de menú |
| PM2 | `DATABASE_URL` llega al proceso de la API. Hoy no llega |

`process.env` se lee en el composition root (o en el adaptador de conexión), nunca en `domain/`.

## 6. Capas que toca la tarea

- **Dominio:** nada. No hay regla de plato en este cambio.
- **Aplicación:** puerto `DatabaseHealthPort` y caso `CheckDatabaseConnection`. Sin Drizzle.
- **Infraestructura:** cliente Postgres, esquema Drizzle del menú, adaptador de ping, migración generada con Drizzle Kit.
- **HTTP:** `GET /health/database` llama al caso de uso. `GET /health` no cambia de contrato.
- **Web:** no se edita, salvo comprobar que sigue arrancando.
- **Composition root:** lee `DATABASE_URL`, construye el cliente, registra el adaptador, hace el ping antes de escuchar.

## 7. Pruebas que el plan tiene que cubrir

Hay dos familias. Las dos son de esta tarea.

**Sin Postgres.** El caso de uso con un puerto falso:

- Ping ok.
- Ping rechazado.
- El caso no importa Drizzle ni Nest.

**Con Postgres local** (la URL del `.env.example`):

- Migración aplicada y las dos tablas existen.
- Un extra con precio se puede insertar; una exclusión, con precio nulo.
- La base rechaza extra sin precio y exclusión con precio.
- Un plato inactivo sigue siendo legible.
- Reiniciar el cliente no borra la fila.
- `GET /health` sigue en `ok`.
- `GET /health/database` en `ok` con la base arriba, y no en `ok` con la base inalcanzable.
- La web responde en `/`.

El detalle paso a paso está en el plan de acción. Un test de “la API enciende” no sustituye el ping.

## 8. Fuera de esta tarea

- Entidades `MenuItem`, `Modifier`, `Money`, `TaxRate` y sus tests de reglas (tarea 2).
- `MenuRepository` y los cuatro casos de menú (tarea 2 el contrato de aplicación; tarea 3 el adaptador Drizzle de ese puerto y los endpoints).
- Pantalla `/menu` (tarea 4).
- Docker obligatorio. El stack dice que Docker es opcional. Hace falta un Postgres que cumpla la URL; si no está, la tarea se detiene y se dice, no se inventa una base en memoria para el arranque real.

## 9. Riesgo de alcance

El riesgo concreto es implementar el CRUD “ya que las tablas existen”. Esta tarea termina cuando la base migra, el ping es honesto y los dos procesos arrancan. El primer insert de producto con reglas de menú es de la tarea 2 en adelante.

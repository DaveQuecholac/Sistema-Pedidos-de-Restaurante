# Análisis: de monolito modular a microservicios
## Sistema de Pedidos de Restaurante

**Fecha:** 28 de octubre de 2026  
**Base:** código entregado en `apps/api` (casos de uso y schema Drizzle), `documentacion-inicial/analisis-estilo-sistema-despliegue.md`, `documentacion-inicial/analisis-arquitectura.md`, RF1–RF5.  
**Plan general:** `plan-de-accion-general-corte-a-microservicios.md` en esta carpeta. Cada fase tiene su análisis y un plan cuyo archivo dice la fase y qué hace. Este documento no los sustituye.  
**Decisión de este análisis:** cuatro servicios de negocio, un gateway y la web actual. Hexagonal permanece dentro de cada servicio. Entre servicios, gRPC con Protobuf (sección 6). La web sigue en REST.

---

## 1. Qué cambia y qué se queda

Gen 1 ya está entregado: un monolito modular hexagonal (API Nest, web Next, una base PostgreSQL) que cumple RF1–RF5.

El encargo nuevo pide el mismo sistema en microservicios. Eso cambia el **estilo de sistema** y el **despliegue**. No cambia el diseño interno.

| Capa de decisión | Septiembre 2026 (entregado) | A partir de este análisis |
|------------------|-----------------------------|---------------------------|
| Diseño interno | Hexagonal (puertos y adaptadores) | Igual, repetido dentro de cada servicio |
| Estilo del sistema | Monolito modular | Microservicios por contexto de negocio |
| Despliegue | Un proceso de API y una base | Varios procesos, una base por servicio, un gateway |

`analisis-estilo-sistema-despliegue.md` sigue siendo el registro de por qué Gen 1 se construyó como monolito. Su decisión de despliegue queda superada por este documento. `analisis-arquitectura.md` y `arquitectura-hexagonal.md` siguen mandando dentro de cada servicio.

Durante la transición, `docs/desarrollo/dev-spec-gen1.md` y `.cursor/rules/dev-spec-gen1.mdc` describen el monolito entregado y prohíben cablear microservicios. Contradicen este análisis a propósito. Mandan sobre el código que todavía vive en el monolito. Este análisis manda sobre el corte. El maestro de construcción se actualiza al abrir la implementación, no en este paso.

## 2. Lectura del código que se va a partir

Hoy todo corre en un `AppModule`: menú, mesas, órdenes, cocina, totales, cuenta de mesa y cobro. Una sola base. Los casos de uso se llaman entre sí por puertos en el mismo proceso.

### 2.1 Lo que ya está despegado

- `orders.table_id` es texto. No hay clave foránea hacia `tables`.
- `LineItem.capture` congela en la línea el nombre, el precio unitario, el impuesto y los modificadores del momento.
- El modificador de la línea no apunta a la fila viva del catálogo.
- `PaymentPort` aísla efectivo, tarjeta y pasarela simulada. `CloseOrder` no conoce esos medios.
- Si el guardado falla después de un cargo aprobado, el caso de uso pide `void`. Si el void también falla, queda `PaymentVoidFailedError` y la orden sigue en `READY`.

### 2.2 Lo que sigue pegado

Hay una sola clave foránea que cruza módulos: `order_lines.menu_item_id` → `menu_items.id`.

Hay cuatro llamadas de aplicación que cruzan módulos:

| Caso de uso | A quién llama hoy | Para qué |
|-------------|-------------------|----------|
| `AddLine`, `ModifyLine` | `MenuRepository.findById` | Capturar el plato vigente (precio, impuesto, modificadores, activo) |
| `OpenOrder` con mesa | `TableRepository` | Comprobar que la mesa existe y está activa, y abrir el sitting |
| `DeactivateTable` | `OrderRepository.listActiveByTableId` | Rechazar la baja si hay comanda activa |
| `CloseOrder`, `CloseTableAccount` | `PaymentPort` y el repositorio de órdenes | Cobrar y persistir el cierre en el mismo caso de uso |

`OpenOrder` con ID externo no consulta mesas. `CalculateTotals` solo lee la orden. Cocina (`SendToKitchen`, `BeginCooking`, `MarkOrderReady`) solo muta la orden.

Las filas de pago (`order_payments`, `table_sitting_payments`) viven en el mismo schema que la orden y referencian `orders.id` o `table_sittings.id`.

## 3. Corte

Cuatro servicios de negocio. La web sigue siendo el adaptador de entrada y habla con un solo gateway. Pagos no tiene ruta pública: solo Órdenes lo llama.

```text
Web (Next)
    │
    ▼
Gateway          enruta; no calcula ni cobra
    │
    ├── Menú       RF1          base menu
    ├── Salón      catálogo     base salon
    ├── Órdenes    RF2–RF4      base orders
    └── Pagos      RF5          base payments   (solo desde Órdenes)
```

| Servicio | Es dueño de | Tablas que se muda |
|----------|-------------|--------------------|
| Menú | Platos, ingredientes, modificadores, precio e impuesto vigentes | `menu_items`, `menu_item_ingredients`, `menu_item_modifiers` |
| Salón | Etiqueta, zona y alta/baja de la mesa | `tables` |
| Órdenes | Comanda, líneas, estado de cocina, propina, descuento, cuenta de mesa | `orders`, `order_lines`, `order_line_modifiers`, `table_sittings` |
| Pagos | Cargo, rechazo y anulación (efectivo, tarjeta, pasarela simulada) | Lo que hoy está en `order_payments` y `table_sitting_payments` |

Órdenes guarda `paymentId` y `reference` al cerrar. El detalle del medio (efectivo entregado, últimos 4, referencia del pagador) vive en Pagos.

`menuItemId` en la línea sigue siendo el id del plato, ya sin clave foránea. `tableId` en la orden y en el sitting sigue siendo el id de la mesa, como texto.

### 3.1 Salón es el corte más fino

El catálogo de mesas ya tiene repositorio, casos de uso y tabla propios. Separarlo deja visible una consulta síncrona de ida y vuelta con Órdenes.

Si más adelante el curso pide tres servicios, Salón se pliega dentro de Órdenes y el gateway deja de tener una ruta `/tables` hacia otro proceso. Menú y Pagos siguen separados: son los cortes que el código ya preparó (snapshot de precio y `PaymentPort`).

## 4. Qué permanece dentro de Órdenes

Cocina, totales y cuenta de mesa no son servicios.

La cocina es la máquina de estados del agregado:

```text
OPEN → SENT_TO_KITCHEN → IN_KITCHEN → READY → CLOSED
  │            │
  └────────────┴──→ CANCELLED
```

RF3 (no editable al iniciar cocción) es una invariante de ese objeto. Un servicio de cocina tendría que mutar la misma orden a través de la red y partir la transacción que hoy protege la regla.

`CalculateTotals` no tiene tabla. Lee las líneas ya capturadas y devuelve subtotal, descuento, propina, impuesto y total. Un servicio de cálculo sería una segunda fuente del total.

`table_sittings` agrupa las órdenes de una mesa (modo `combined` o `separate`) y se cierra con ellas. La cuenta de mesa se queda en Órdenes.

La ocupación de una mesa no se copia a Salón. Hoy se deriva de las órdenes activas, y así se queda: Salón pregunta en el momento de desactivar.

## 5. Puertos entre servicios

Cada servicio conserva `domain/`, `application/` (casos de uso y puertos), `infrastructure/` e `interface/http/`. El módulo Nest de ese servicio elige el adaptador concreto.

| Puerto | Lo define | Adaptador | Sustituye |
|--------|-----------|-----------|-----------|
| `MenuCatalog` | Órdenes | Cliente gRPC de Menú | La lectura de `MenuRepository` dentro de `AddLine` y `ModifyLine` |
| `TableCatalog` | Órdenes | Cliente gRPC de Salón | `TableRepository` dentro de `OpenOrder` |
| `ActiveOrdersQuery` | Salón | Cliente gRPC de Órdenes | `listActiveByTableId` dentro de `DeactivateTable` |
| `PaymentPort` | Órdenes llama; Pagos ejecuta el cargo | Cliente gRPC de Pagos | Los adaptadores fake en proceso |

`MenuRepository` de escritura se queda en Menú. Órdenes no administra platos: pide un snapshot (id, nombre, precio, impuesto, modificadores, activo). `AddLine` sigue construyendo la línea con ese snapshot y congelando los importes.

Efectivo, tarjeta y pasarela simulada se mueven dentro de Pagos, detrás del mismo puerto. Siguen siendo adaptadores simulados. Este corte no conecta una pasarela real.

`packages/contracts` guarda los `.proto` de esos intercambios (snapshot de plato, mesa activa, cargo y resultado) y los tipos generados. `Money` puede vivir en un paquete mínimo compartido, porque es estable y no conoce órdenes. La entidad `Order` no se comparte: importarla entre servicios reconstruye el monolito por la librería.

## 6. Cómo se hablan

Hay dos canales. Protobuf no sustituye a gRPC: describe los mensajes y gRPC los transporta.

| Tramo | Protocolo | Quién |
|-------|-----------|-------|
| Navegador → gateway → Menú, Salón, Órdenes | REST y JSON. Zod valida el borde HTTP | La web ya habla así. El gateway enruta y no traduce a gRPC |
| Órdenes → Menú (`MenuCatalog`) | gRPC | Precio vigente al capturar o modificar la línea |
| Órdenes → Salón (`TableCatalog`) | gRPC | La mesa existe y está activa |
| Salón → Órdenes (`ActiveOrdersQuery`) | gRPC | Hay comanda activa antes de dar de baja la mesa |
| Órdenes → Pagos (`PaymentPort`) | gRPC | Cargo y void. Pagos no publica REST |
| `OrderSentToKitchen` (fase 5) | Mensaje con outbox | Avisa que la orden ya se envió. No cobra ni calcula |

Menú, Salón y Órdenes exponen REST para el gateway y gRPC para los otros servicios. Pagos solo escucha gRPC, en la red interna. Los `.proto` nacen en la fase 2, con el primer cliente real. La fase 1 no abre red.

Las cuatro llamadas gRPC necesitan respuesta en el momento: el precio que se congela, la mesa al abrir, la comanda al desactivar y el cargo al cerrar. Leer menú o mesa se puede reintentar. El cargo se reintenta solo con clave de idempotencia `orderId` (o `sittingId` en cuenta combinada) y devuelve la misma referencia.

El evento de cocina no cambia ese criterio. El análisis de septiembre ya dejaba los eventos como complemento.

## 7. Cierre de orden

`CloseOrder` hoy carga la orden, compara `expectedTotal` con `order.totals().total`, cobra y marca `CLOSED` en un caso de uso. Con dos bases no hay un commit que cubra las dos. El cierre pasa a esta secuencia:

1. Órdenes comprueba que la orden puede cerrarse y que el total esperado coincide con el calculado en el agregado.
2. Pagos cobra con clave de idempotencia `orderId`. Si ese cargo ya existe, devuelve la misma referencia.
3. Órdenes marca `CLOSED` y guarda `paymentId` y `reference`.
4. Si el paso 3 falla, Órdenes pide el void de esa referencia. Si el void falla, la orden sigue en `READY` y el cargo queda para conciliar.

`CloseTableAccount` usa la misma secuencia con clave `sittingId` y, al confirmar, cierra las órdenes cobrables de esa cuenta.

Durante unos instantes Pagos puede tener un cargo aprobado y Órdenes seguir en `READY`. Es el hueco entre el paso 2 y el 3, cerrado por el void o por repetir el cierre con la misma clave.

El precio de una línea es el de la captura. Un cambio posterior en Menú no reescribe esa línea.

## 8. Si un servicio no responde

| Servicio caído | Sigue | Se detiene |
|----------------|-------|------------|
| Menú | Cocina y cobro de líneas ya capturadas | Agregar o modificar líneas; admin de platos |
| Salón | Pedidos con ID externo y comandas ya abiertas | Abrir por mesa; plano de mesas |
| Pagos | Comanda y cocina | Cerrar y cobrar |
| Órdenes | Editar menú y plano de mesas | El servicio de piso |

Esa tabla es el resultado útil del corte. Menú puede cambiar precios sin tocar una comanda abierta. Un fallo de cobro no impide cocinar lo ya pedido.

## 9. Despliegue de la demo

Un servidor PostgreSQL con cuatro bases: `menu`, `salon`, `orders`, `payments`. Es base por servicio sin levantar cuatro motores. En un entorno real cada base podría ir en su propio servidor; para la demo académica basta el Postgres que el repo ya enciende.

El gateway publica `/menu`, `/tables` y `/orders` (incluye cocina, totales y cuenta de mesa) en REST. Pagos escucha solo gRPC en la red interna del compose.

La web cambia la URL base hacia el gateway. Las pantallas siguen disparando los mismos casos: admin de menú, plano, comanda, cocina, cuenta y cobro.

Forma del repo al terminar el corte:

```text
apps/web
apps/gateway
apps/menu
apps/salon
apps/orders
apps/payments
packages/contracts
```

Cada app de negocio repite el hexágono solo con su rebanada. No se copia el monolito entero cuatro veces.

## 10. Conclusión

El sistema queda en cuatro servicios de negocio más gateway y la web ya entregada. Menú es dueño del catálogo vigente. Salón es dueño del plano. Órdenes es dueña de la comanda, la cocina, los totales y la cuenta de mesa. Pagos es dueño del cargo y solo habla con Órdenes.

El primer corte físico, todavía dentro del monolito, es quitar la clave foránea de `order_lines` hacia `menu_items`. El orden de extracción posterior es Pagos, luego Menú, luego Salón junto con el gateway. El evento de cocina va al final y no sustituye las llamadas síncronas de la sección 6.

El recorrido por fases está en `plan-de-accion-general-corte-a-microservicios.md`.

# Plan de acción — Fase 2 · Extraer Pagos por gRPC

**Fecha:** 28 de octubre de 2026  
**Análisis de la fase:** `analisis.md` en esta carpeta.  
**Corte:** `../analisis.md`, secciones 5, 6 y 7. **Plan general:** `../plan-de-accion-general-corte-a-microservicios.md`.  
**Estado:** cerrado en código el 28 de octubre de 2026. Migraciones `apps/api/drizzle/0012_late_tarantula.sql`, `apps/api/drizzle/0013_milky_magma.sql` y `apps/payments/drizzle/0000_military_mac_gargan.sql`. La corrida está en `docs/desarrollo/pruebas-cttm.md`. La fase 1 sigue en `0011_talented_scorpion.sql`.  
**Ya en código:** fase 1. `order_lines.menu_item_id` ya no es clave foránea (`0011_talented_scorpion.sql`). Esta fase no la toca.

Al cerrar, abrir, agregar una línea, cocina, totales y cobro siguen respondiendo igual por REST. El cargo ya no lo hace la API en proceso: lo hace `apps/payments` por gRPC, y la fila rica vive en la base `payments`.

---

## 1. Resultado

`CloseOrder` y `CloseTableAccount` siguen en la API. Su `PaymentPort` es un cliente gRPC. Efectivo, tarjeta y pasarela simulada corren en Pagos, que no escucha HTTP. La API guarda solo `payment_id` y `payment_reference`. El detalle del medio vive en Pagos.

**Señal:** un cobro simulado deja una fila en `payments.payments` y ninguna en `order_payments` (esa tabla ya no está). Un segundo cargo del mismo sujeto, mismo monto y mismo medio, devuelve la misma `reference`. Si guardar la orden falla después de aprobar, Pagos recibe `Void` y la orden sigue en `READY`.

## 2. Archivos

### Se crean

| Archivo | Rol |
|---------|-----|
| `packages/contracts/payment.proto` | Contrato gRPC de esta fase. El paquete se llama `@restaurante/contracts` |
| `packages/contracts/package.json` | Solo para que los dos apps dependan del `.proto` por workspace |
| `pnpm-workspace.yaml` | Suma `packages/*` |
| `apps/payments/` | Hexágono de Pagos: dominio del cargo, casos `ChargePayment`, `VoidPayment`, `GetReceipt`, Drizzle, adaptadores simulados, servidor gRPC |
| `apps/payments/drizzle/0000_*.sql` | Tabla `payments`, solo vía `db:generate` de ese paquete |
| `scripts/dev/copy-payments-out-of-orders.mjs` | Una sola vez: copia filas viejas y rellena `payment_id` / `payment_reference`. No vive junto a un caso de uso |
| `apps/api/drizzle/0012_*.sql` | Agrega las dos columnas. Solo `db:generate` |
| `apps/api/drizzle/0013_*.sql` | Quita `order_payments` y `table_sitting_payments`. Solo `db:generate`, después de la copia |

Los nombres `0012` y `0013` son el turno que toca. El sufijo lo pone Drizzle Kit. No se inventa el nombre del archivo antes de generar.

### Se tocan

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/infrastructure/persistence/drizzle/schema/order.ts` | Primero las dos columnas. Después, fuera del schema, las tablas `orderPayments` y `tableSittingPayments` |
| `apps/api/src/infrastructure/persistence/drizzle/drizzle-order-repository.ts` y `order.mapper.ts` | Guardan y leen `payment_id` y `payment_reference`. El cuerpo del pago entra por `PaymentReceiptQuery` |
| `apps/api/src/infrastructure/persistence/drizzle/drizzle-table-sitting-repository.ts` | Igual para la cuenta de mesa |
| `apps/api/src/application/ports/payment-receipt-query.ts` | Puerto nuevo: `findBySubjectId(subjectId): Promise<Payment \| null>` |
| `apps/api/src/infrastructure/payment/grpc-payment-adapter.ts` | Implementa `PaymentPort` y el puerto de lectura. Sustituye a las tres clases en proceso |
| `apps/api/src/app.module.ts` y el arranque que lee `process.env` | `PAYMENTS_GRPC_URL`. Los tres adaptadores simulados salen del composition root |
| `apps/api/src/infrastructure/payment/cash-payment-adapter.ts`, `card-payment-adapter.ts`, `digital-gateway-fake-adapter.ts` y sus specs | Se van a `apps/payments`. La API no los importa |
| `ecosystem.config.cjs` | Proceso `restaurante-payments` junto a api y web |
| Specs de integración de órdenes que hoy escriben `order_payments` | Leen las dos columnas y un recibo de prueba, no la tabla vieja |

### No se tocan

- `domain/order/**`, `domain/totals/**`, `domain/menu/**`, `domain/payment/payment.ts` (el cambio y la forma del pago siguen ahí).
- `CloseOrder` y `CloseTableAccount`, salvo que el adaptador nuevo encaje en el `PaymentPort` que ya tienen. No se reescribe la saga.
- `interface/http/**` y `apps/web/**`. El JSON de cierre y de `GET /orders/:orderId/payment` se queda.
- `schema/menu.ts`, `schema/table.ts`, la columna `menu_item_id`.
- Gateway, Menú como proceso, Salón como proceso, eventos.

Si hace falta un archivo fuera de esta lista, se anota en el chat y se acuerda antes de seguir.

## 3. Capas

| Dónde | Qué |
|-------|-----|
| Dominio de la API | No se toca. `Order.close` sigue exigiendo un `Payment` cuyo monto es el total. El cambio sigue saliendo de efectivo entregado menos monto, y no se guarda |
| Application de la API | `PaymentPort` igual: `charge` y `voidCharge`. Puerto nuevo `PaymentReceiptQuery` para rehidratar el pago al leer una orden cerrada o una cuenta cerrada. `FakePaymentPort` se queda para los tests de casos de uso |
| Adaptador de la API | Cliente gRPC. El repositorio Drizzle deja de escribir las tablas de pago |
| Pagos | Dominio propio del cargo (no importa el `Order` de la API). Casos de uso que cobran, anulan y leen. Adaptadores simulados detrás de un puerto interno. Drizzle en `infrastructure`. gRPC en `interface`. Sin REST |
| Composition root | La API elige el cliente gRPC. Pagos elige los tres adaptadores simulados. `process.env` solo en esos arranques |

## 4. Contrato

### 4.1 Protobuf

Archivo `packages/contracts/payment.proto`. Se carga en runtime con `@grpc/proto-loader`. No se agrega `protoc` ni código generado al repo.

```protobuf
syntax = "proto3";
package restaurante.payments.v1;

service PaymentService {
  rpc Charge(ChargeRequest) returns (ChargeReply);
  rpc Void(VoidRequest) returns (VoidReply);
  rpc GetReceipt(GetReceiptRequest) returns (GetReceiptReply);
}

message ChargeRequest {
  string subject_id = 1;
  int32 amount = 2;
  string currency = 3;
  string method = 4;
  optional int32 tendered_amount = 5;
  optional string card_last4 = 6;
  optional string payer_reference = 7;
}

message Receipt {
  string payment_id = 1;
  string subject_id = 2;
  string method = 3;
  int32 amount = 4;
  string currency = 5;
  optional int32 tendered_amount = 6;
  optional string card_last4 = 7;
  optional string payer_reference = 8;
  string reference = 9;
  string paid_at = 10;
  string status = 11;
}

message ChargeReply {
  string outcome = 1;
  string reference = 2;
  string decline_reason = 3;
  Receipt receipt = 4;
}

message VoidRequest {
  string reference = 1;
}

message VoidReply {}

message GetReceiptRequest {
  string subject_id = 1;
}

message GetReceiptReply {
  Receipt receipt = 1;
}
```

`subject_id` es el id que el caso de uso ya manda: `order.id` en `CloseOrder`, `sitting.id` en `CloseTableAccount` (hoy ese valor viaja en `ChargeRequest.orderId`). No se renombra el campo del dominio.

| `outcome` | Cuándo |
|-----------|--------|
| `approved` | Hay `reference` y `receipt` con `status = approved` |
| `declined` | `decline_reason` es `cardDeclined` o `gatewayDeclined`. No hay fila |

`paid_at` es ISO-8601 en UTC. `method` es `cash`, `card` o `digitalGateway`.

Los disparadores simulados se mudan con los adaptadores y no cambian: tarjeta `0002` rechaza, `0119` tira caída, `rechazo@pasarela.test` rechaza, `caida@pasarela.test` tira caída. Efectivo siempre aprueba; el efectivo de menos sigue rechazándose en la API antes de llamar.

### 4.2 Idempotencia y void

| Situación | Pagos |
|-----------|--------|
| No hay cargo `approved` para ese `subject_id` | Inserta uno y devuelve su `reference` |
| Ya hay uno `approved` con el mismo monto, moneda y medio | Devuelve esa fila. No inserta otra |
| Ya hay uno `approved` y el monto o el medio no coinciden | Error gRPC `ALREADY_EXISTS`. La API no cierra la orden |
| `Void` de una `reference` aprobada | La fila pasa a `voided` |
| `Void` de una `reference` ya `voided` | Responde vacío, sin error |
| `Void` de una `reference` que no existe | `NOT_FOUND`. La API lo trata como fallo de void (`PaymentVoidFailedError`) |
| Cargo nuevo después de un void | El `voided` no cuenta. Puede insertarse otro `approved` |

### 4.3 Tabla en la base `payments`

Una tabla `payments`. La base se crea en el mismo servidor (`CREATE DATABASE payments`), no es otro motor. Migración solo con el Drizzle Kit de `apps/payments`.

Columnas: `payment_id` texto clave primaria, `subject_id` texto no nulo, `method`, `amount`, `currency`, `tendered_amount`, `card_last4`, `payer_reference`, `reference`, `paid_at`, `status` (`approved` o `voided`).

Checks que hoy viven en `order_payments` y hay que repetir aquí, no en la API: medio dentro de los tres, monto `>= 0`, moneda de 3, `reference` de 1 a 64, y la forma por medio (efectivo con entregado `>=` monto y sin tarjeta ni pagador; tarjeta con 4 dígitos y sin entregado ni pagador; pasarela con pagador de 3 a 64 y sin entregado ni tarjeta). Índice único parcial: un solo `approved` por `subject_id`. `reference` única.

El SQL generado tiene que ser ese `CREATE TABLE` con sus checks. Si trae otra tabla, se corrige el schema, `drizzle-kit drop` y se regenera. No se edita el `.sql`.

### 4.4 Columnas en la API, en dos migraciones

No caben en un solo `db:generate`: el `DROP TABLE` y la copia de filas tienen que ir en medio, y el SQL no se edita a mano.

**0012**, con las tablas viejas todavía en el schema. En `orders` y en `table_sittings`:

- `payment_id` texto, nulo
- `payment_reference` texto, nulo

Check en cada tabla: las dos nulas o las dos con texto no vacío. En `orders`, además: si `table_settlement_id` no es nulo, las dos van nulas (la orden de cuenta de mesa no tiene pago propio). El SQL de esta migración es solo `ADD COLUMN` y esos `CHECK`. Nada de `DROP`.

**Copia**, `scripts/dev/copy-payments-out-of-orders.mjs`, después de migrar 0012 y de migrar la base `payments`:

- Lee `order_payments`. Inserta en `payments.payments` con `subject_id = order_id` y `status = approved`. Rellena `orders.payment_id` y `orders.payment_reference`.
- Lee `table_sitting_payments`. Inserta con `subject_id = sitting_id`. Rellena `table_sittings.payment_id` y `table_sittings.payment_reference`.
- Si no hay filas, termina en cero sin error.
- Se puede correr dos veces: la segunda no duplica (`payment_id` ya existe).

**0013**, ya sin `orderPayments` ni `tableSittingPayments` en el schema. El SQL es `DROP TABLE` de esas dos. No borra `orders` ni `table_sittings`.

Si 0012 o 0013 traen de más, `drizzle-kit drop` de esa migración y se regenera. Si `db:migrate` falla, se para. No hay `ALTER` a mano.

### 4.5 Lectura del recibo

Al guardar una orden cerrada con pago, el repositorio escribe `payment_id` y `payment_reference` y no escribe medio ni montos. Al leerla, si esas columnas tienen valor, llama `PaymentReceiptQuery.findBySubjectId(orderId)` y rearma el `Payment` del dominio. Si la orden está `CLOSED`, no es de cuenta de mesa, y el recibo no llega, el mapeo falla con el error de mapeo que el repositorio ya usa (`OrderMappingError`): no se inventa un pago vacío.

La cuenta de mesa igual, con `sitting.id`. `GET /orders/:orderId/payment` sigue armando el JSON actual, cambio incluido, porque el `Payment` de dominio ya lo calcula.

## 5. Pruebas

### En Pagos, sin la API

Con la base `payments` migrada. Variable `PAYMENTS_REPOSITORY_INTEGRATION=1` y `PAYMENTS_DATABASE_URL`. Si no están, el bloque se salta, igual que las de órdenes.

| Id | Qué demuestra |
|----|----------------|
| P2-1 | Efectivo de 1000 con entregado 1500 inserta una fila `approved`. Otro `Charge` igual devuelve la misma `reference` y sigue habiendo una fila |
| P2-2 | El segundo cargo del mismo `subject_id` con monto distinto responde conflicto y no inserta |
| P2-3 | Tarjeta `0002` responde `declined` / `cardDeclined` y no inserta. `0119` falla sin fila |
| P2-4 | `rechazo@pasarela.test` rechaza sin fila. `caida@pasarela.test` falla sin fila. Una referencia normal aprueba |
| P2-5 | `Void` de la referencia de P2-1 deja `voided`. Otro `Void` de la misma referencia no falla. Un `Charge` nuevo del mismo `subject_id` inserta otro `approved` |
| P2-6 | `GetReceipt` del `subject_id` aprobado devuelve últimos 4 o entregado, los que correspondan al medio. `GetReceipt` de un id desconocido viene vacío |
| P2-7 | La base rechaza monto negativo, medio desconocido, tarjeta que no son 4 dígitos y dos `approved` del mismo `subject_id` |

Esos casos entran por el caso de uso de Pagos con repositorio Drizzle, no por SQL suelto, salvo P2-7, que es la restricción de la base.

Los specs que hoy viven junto a los adaptadores simulados se mudan con ellos y tienen que seguir pasando dentro de `apps/payments`.

### En la API, sin Postgres y sin gRPC

```bash
env -u DATABASE_URL pnpm --filter @restaurante/api test
pnpm --filter @restaurante/api typecheck
```

Tienen que seguir verdes. En particular `close-order.spec.ts`: rechazo no guarda, y si `save` falla después de aprobar se llama `voidCharge`. Esos tests siguen con `FakePaymentPort`. No se les enchufa gRPC.

Un caso nuevo de adaptador, con un doble del cliente gRPC (sin proceso real): `GrpcPaymentAdapter` traduce `approved`, `declined`, `ALREADY_EXISTS` y `NOT_FOUND` del void a los errores que `CloseOrder` ya entiende. `ALREADY_EXISTS` no cierra. `NOT_FOUND` en el void es `PaymentVoidFailedError`.

### Cruce de proceso

`PAYMENTS_GRPC_INTEGRATION=1`, Pagos escuchando y las dos bases migradas.

| Id | Qué demuestra |
|----|----------------|
| P2-8 | La API, por el adaptador real, cobra un efectivo. La fila está en `payments.payments`. `order_payments` no existe. La orden queda `CLOSED` con `payment_id` y `payment_reference` iguales al recibo |
| P2-9 | Se fuerza el fallo de `orders.save` después del cargo (el mismo arreglo que el test de dominio, ahora contra el proceso). La fila queda `voided` y la orden sigue en `READY` |

### Regresión de la API con base

```bash
pnpm --filter @restaurante/api test:db
```

Los casos que cerraban una orden y leían `order_payments` pasan a leer las dos columnas y un `PaymentReceiptQuery` de prueba en memoria. No levantan Pagos. F1, F2 y F3 de la fase 1 siguen verdes.

`pnpm --filter @restaurante/payments test` y su typecheck también. `apps/web` no se toca y no entra en la compuerta.

## 6. Demo de piso

La UI no cambia. Hace falta la API en `http://localhost:3001`, Pagos en gRPC `localhost:50051` y las dos bases migradas.

1. `POST /menu-items` con precio `{ "amount": 1000, "currency": "MXN" }`, impuesto `{ "basisPoints": 0 }`, un ingrediente y `modifiers: []`.
2. `POST /orders` con un `externalOrderId` único.
3. `POST /orders/:orderId/lines` con ese plato, cantidad 1 y `modifierIds: []`.
4. `send-to-kitchen`, `begin-cooking`, `mark-ready`.
5. `GET /orders/:orderId/totals`. Ese `total` es el `expectedTotal`.
6. `POST /orders/:orderId/close` con efectivo y `tendered` igual al total. La orden queda `CLOSED`.
7. `GET /orders/:orderId/payment` devuelve el mismo `reference`, el entregado y el cambio (cero si el entregado es el total).
8. En la base `payments`, una fila `approved` con ese `subject_id`. En la base de la API, `order_payments` no está, y la orden tiene `payment_id` y `payment_reference`.
9. Repetir el cierre de esa misma orden ya `CLOSED` no crea una segunda fila. El estado de la orden lo rechaza la API antes de cobrar, como hoy.
10. Un plato de 1000, otra orden llevada a `READY`, cierre con tarjeta `0002`: la orden no queda `CLOSED` y en `payments` no hay fila de ese `subject_id`.

Sin las dos bases o sin Pagos en el gRPC, la fase no se marca cerrada.

## 7. Fuera

- Proceso de Menú, proceso de Salón, gateway, cambiar la URL de la web.
- `.proto` que no sea el de pagos.
- Pasarela real, ruta HTTP en Pagos, que el navegador hable gRPC.
- Reescribir `Order.close`, el cálculo del cambio o los totales.
- Borrar `menu_item_id` o reabrir la FK de la fase 1.
- Compartir la clase `Order` con Pagos.
- El plan de la fase 3. Se pide cuando esta fase esté cerrada en código.

## 8. Pasos

1. Leer el análisis de esta carpeta y las secciones 5, 6 y 7 de `../analisis.md`. No abrir la fase 3.
2. Agregar `packages/*` al workspace, el `package.json` de contratos y `payment.proto` de la sección 4.1.
3. Crear `apps/payments` con su hexágono, los tres adaptadores mudados y el schema de la sección 4.3. `pnpm --filter @restaurante/payments db:generate`. Revisar el SQL. `CREATE DATABASE payments` si no existe. `db:migrate` de Pagos.
4. Escribir P2-1 a P2-7 y dejarlos verdes.
5. En el schema de la API, agregar las dos columnas y los checks de la sección 4.4, sin quitar las tablas viejas. `db:generate` → revisar que sea solo `ADD COLUMN` y `CHECK` → `db:migrate`. Eso es 0012.
6. Correr `scripts/dev/copy-payments-out-of-orders.mjs`. Verificar que cada fila vieja tiene pareja en `payments` y que las columnas nuevas coinciden.
7. Quitar `orderPayments` y `tableSittingPayments` del schema. `db:generate` → revisar que sea solo los dos `DROP TABLE` → `db:migrate`. Eso es 0013.
8. Puerto `PaymentReceiptQuery`, adaptador gRPC, y el repositorio de órdenes y el de sittings guardando y leyendo como la sección 4.5. El módulo de la API deja de construir los tres adaptadores en proceso.
9. Proceso `restaurante-payments` en `ecosystem.config.cjs`. `PAYMENTS_GRPC_URL` solo en el arranque de la API. `pnpm dev:restart`.
10. Correr la regresión de la sección 5, P2-8 y P2-9, y la demo de la sección 6.
11. Anotar la corrida en `docs/desarrollo/pruebas-cttm.md`, con los nombres reales de `0012`, `0013` y el `0000` de Pagos. No borrar la corrida de la fase 1.
12. En el plan general, marcar la fase 2 como cerrada en código. Marcar este archivo como cerrado, con la fecha y esas migraciones.

Si el paso 3, 5 o 7 falla, no se sigue. No se escribe SQL a mano para «destrabar» la migración.

## 9. Siguiente paso

Cerrado. El siguiente paso es escribir el plan de la fase 3 cuando se pida. No se escribe en este turno.

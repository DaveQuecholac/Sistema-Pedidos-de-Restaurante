# Análisis — Tarea 3 · Pantalla de cobro, recorrido completo y demo MVP (E5)

**Rama:** `dev/pagos`  
**Sprint:** 4 (RF5). Tarea 3 de 3. Solo esta. Cierra la demo del Sprint 4 y del MVP.  
**Fecha:** 4 de octubre de 2026  
**Estado:** cerrada el 4 de octubre de 2026 (ver plan §10).  
**Plan:** `plan-de-accion.md` en esta carpeta.  
**Reglas de cobro:** `../01-cobro-en-el-nucleo/analisis.md`. **Contrato HTTP:** sección 7 de `../02-adaptadores-persistencia-y-api/analisis.md`.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Qué pide la tarea

Tarjetas de Trello:

- «Pantalla de cobro»: elegir medio, confirmar, ver resultado; orden cerrada, sin seguir editando.
- «Pulido del recorrido completo (UX)»: navegación Menú → Comanda → Totales → Cobro; vacíos y errores en todo el flujo; presentable en demo.
- «Demo Sprint 4 — MVP completo presentable»: flujo completo en navegador; probar los 3 medios; regresión de sprints 1–3.

Gen 1 pide además «UI cobro + E2E» para el Sprint 4 (decisión 4).

## 2. Qué deja la tarea 2

- `POST /orders/:orderId/close` y `GET /orders/:orderId/payment`, que responden `{ orderId, status, payment }`.
- `READY` trae `allowedActions: ["close"]`; `CLOSED` trae `[]`.
- Errores con `{ code, message }`: 400, 402, 404, 409, 422, 500, 503.
- Disparadores del simulador: tarjeta `0002` (rechazo) y `0119` (caída); pasarela `rechazo@pasarela.test` y `caida@pasarela.test`.

## 3. Qué hay en la web

| Pieza | Uso en esta tarea |
|-------|-------------------|
| `app/orders/order-api.ts` | Se reusa `request`, `OrderApiError`, `getOrder`, `listOrders`. `OrderActionJson` gana `'close'` (una línea) |
| `app/orders/order-view.ts` | Se reusa `originLabel`, `statusLabel`, `errorText`, `can`. `lockNotice` ya tiene el texto de `CLOSED` |
| `app/orders/[orderId]/totals/totals-api.ts` | Se reusa `getOrderTotals` para mostrar el total a cobrar |
| `app/menu/menu-amount.ts` | Se reusa `centavosToLabel` y `pesosToCentavos`. No se modifica |
| `app/orders/orders.module.css` | Se agregan las clases del selector de medio y del comprobante |
| `order-detail-screen.tsx` | Solo gana el enlace «Cobrar» / «Ver cobro» |
| `totals-screen.tsx` | Solo gana el enlace «Cobro» en su navegación |
| `orders-screen.tsx` | Hoy lista solo órdenes vivas (`OPEN` … `READY`). Una cerrada desaparece de Comandas (decisión 3) |
| `kitchen-screen.tsx` | Lista `SENT_TO_KITCHEN`, `IN_KITCHEN`, `READY`. Al cobrar, la orden sale sola de «Listas». No cambia |
| `app/page.tsx` | Inicio con Menú · Comandas · Cocina |

## 4. La pantalla

Ruta `/orders/[orderId]/payment`, título «Cobro». Rol: caja o mesero.

| Zona | Qué muestra | De dónde sale |
|------|-------------|---------------|
| Encabezado | «Mesa 5 · Cobro» o «Pedido externo UBER-1 · Cobro», insignia de estado, enlaces «Comanda», «Cuenta», «Comandas» | `GET /orders/:id` |
| Total a cobrar | El total en grande | `GET …/totals` (`total`) |
| Medio | Selector «Efectivo», «Tarjeta», «Pasarela digital» | — |
| Dato del medio | Efectivo: «Monto recibido» + atajo «Monto exacto». Tarjeta: «Últimos 4 dígitos» (4 dígitos, teclado numérico). Pasarela: «Correo o teléfono del cliente» | Lo escribe el cajero |
| Confirmación | «Cobrar $164.20 con Efectivo · Recibido $200.00» + «Confirmar cobro» y «Volver» | Lo capturado + el total del servidor |
| Comprobante | «Orden cerrada», medio, total cobrado, recibido y **cambio** (efectivo), «Tarjeta •••• 4242» o la referencia del pagador, referencia del cobro, hora | Respuesta de `POST …/close` o `GET …/payment` |

Reglas:

- **La pantalla no calcula.** No resta el cambio, no compara recibido contra total, no decide si el efectivo alcanza. El cambio sale de `payment.change`; «no alcanza» sale del 422 del servidor.
- La pantalla **sí convierte** lo que se escribe: «200» pesos → `20000` centavos con `pesosToCentavos`. Eso es entrada, no cálculo. «Monto exacto» copia el `total.amount` que mandó el servidor.
- El cuerpo siempre lleva `expectedTotal` = el `total.amount` que se está mostrando.
- El formulario se dibuja solo si `can(order, 'close')`. Nunca se compara `status === 'READY'` para decidir si se cobra.
- Dos pasos: capturar → confirmar. Mientras hay petición en curso, todos los botones están deshabilitados (no hay doble cobro por doble clic).

## 5. Estados y errores

| Situación | Qué hace la pantalla |
|-----------|----------------------|
| Cargando | «Cargando cobro…» |
| 404 de la orden | «Esa comanda no existe» y enlace a `/orders` |
| API caída al cargar | Mensaje y «Reintentar». Ningún número inventado |
| Orden `CLOSED` | Comprobante desde `GET …/payment`. Sin formulario |
| Orden `CANCELLED` | «Esta orden está cancelada. No se cobra.» Sin formulario |
| Orden viva que no está lista (`OPEN`, `SENT_TO_KITCHEN`, `IN_KITCHEN`) | «Se cobra cuando cocina marca la orden como lista.» y enlace a la comanda. Sin formulario |
| Dato inválido en el formulario (vacío, `abc`, tarjeta de 3 dígitos) | Mensaje local; no sale petición |
| Éxito | Se muestra el comprobante con la respuesta. No se vuelve a pedir |
| 402 `PaymentDeclinedError` | Mensaje; vuelve al formulario con el mismo medio; la orden sigue lista |
| 503 `PaymentProcessorUnavailableError` | Mensaje «no se cobró nada»; vuelve al formulario |
| 409 `PaymentAmountMismatchError` | Mensaje y se vuelven a pedir orden y totales (total nuevo) |
| 409 `OrderNotClosableError` u `OrderConcurrencyError` | Mensaje y se vuelve a cargar (si otra caja ya cobró, se ve el comprobante) |
| 422 | Mensaje; el formulario se queda como estaba |
| 500 `PaymentVoidFailedError` | Mensaje para el encargado |

Textos en español para los códigos nuevos:

| Código | Texto |
|--------|-------|
| `PaymentDeclinedError` | El cobro fue rechazado. Prueba con otra tarjeta o con otro medio. |
| `PaymentProcessorUnavailableError` | El procesador de pagos no respondió. No se cobró nada; intenta de nuevo. |
| `PaymentMethodUnavailableError` | Ese medio de pago no está disponible. |
| `PaymentAmountMismatchError` | La cuenta cambió mientras cobrabas. Revisa el total nuevo. |
| `OrderNotClosableError` | Esta orden no se puede cobrar en su estado actual. |
| `InsufficientCashError` | El monto recibido no alcanza para el total. |
| `InvalidCardLast4Error` | Escribe los últimos 4 dígitos de la tarjeta. |
| `InvalidPayerReferenceError` | Escribe el correo o teléfono del cliente (3 a 64 caracteres). |
| `InvalidPaymentMethodError` | Elige un medio de pago. |
| `PaymentVoidFailedError` | Hubo un cargo que no se pudo anular. Avisa al encargado. |

Los demás códigos usan `totalsErrorText` / `errorText` (incluye `InvalidMoneyError` y `OrderConcurrencyError`).

## 6. Pulido del recorrido

Solo esto; nada más «de paso»:

| # | Qué | Dónde |
|---|-----|-------|
| U1 | Inicio lista el recorrido en orden: Administrar menú · Comandas · Cocina, con una línea que explica el flujo (comanda → cocina → cuenta → cobro) | `app/page.tsx` |
| U2 | La comanda, la cuenta y el cobro se enlazan entre sí: Comanda ↔ Cuenta ↔ Cobro, y los tres a Comandas | detalle, cuenta, cobro |
| U3 | En la comanda, «Cobrar» aparece cuando `can(order, 'close')`; «Ver cobro» cuando está cerrada | `order-detail-screen.tsx` |
| U4 | Comandas: selector «Activas / Cerradas»; «Cerradas» usa `listOrders(['CLOSED'])` (el API ya filtra) | `orders-screen.tsx` (decisión 3) |
| U5 | Revisión de vacíos y errores en Menú, Comandas, Cocina, Cuenta y Cobro con el recorrido B; lo que falle se anota y se acuerda antes de tocarlo | todas |

## 7. Demo del sprint (guion MVP)

1. Inicio → «Administrar menú»: la carta con Tacos de suadero y Agua de jamaica.
2. Comandas → abrir Mesa 5; Tacos × 2 con Queso y Agua × 1; «Enviar a cocina»: las líneas se bloquean.
3. Cocina: «Empezar» y «Lista».
4. Comanda → «Ver cuenta»: total $164.20. Descuento 10 % y propina 10 %: $160.83.
5. «Cobro»: Efectivo, recibido $200, confirmar: **cambio $39.17**. Orden cerrada; la cuenta ya no se ajusta; la orden salió de Cocina.
6. Segunda mesa: Tarjeta `0002` → rechazada; tarjeta `4242` → cerrada.
7. Pedido externo: Pasarela digital → cerrada.
8. Comandas → «Cerradas»: las tres órdenes.

Los números salen de la sección 5.5 del análisis de la tarea 1 y de la 5.8 del análisis de totales.

## 8. Fuera de alcance

Ticket o impresión, envío de comprobante, propina en la terminal, dividir la cuenta, reportes y corte de caja, login de cajero, buscar órdenes cerradas por fecha, UI final o design system, Playwright u otra herramienta E2E nueva (decisión 4).

## 9. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Calcular el cambio o la suficiencia del efectivo en el cliente | Revisión R14 con `rg`; las funciones de vista solo dan formato |
| Doble cobro por doble clic | Confirmación en dos pasos y botones deshabilitados (B13); el servidor ya lo bloquea (H56) |
| Cobrar un total viejo | `expectedTotal` del total mostrado; B12 con dos pestañas |
| Romper comandas, cocina o cuenta | Esos archivos solo ganan enlaces (R15); regresión B19 |
| Proceso PM2 viejo en la demo | `pnpm dev:restart` antes del recorrido |
| La carta cambió y los números no cuadran | Paso 0 del plan verifica precios y tasas |

## 10. Decisiones

Hector confirmó las decisiones 3 y 4 el 4 de octubre de 2026.

| # | Tema | Decisión | Estado |
|---|------|----------|--------|
| 1 | Ruta y nombre | `/orders/[orderId]/payment`, «Cobro» | Propuesta |
| 2 | Confirmación | Dos pasos: capturar → confirmar | Propuesta |
| 3 | Órdenes cerradas en Comandas | Selector «Activas / Cerradas» (U4) | Confirmada |
| 4 | E2E | Recorrido guiado en navegador (catálogo B, 1280 px y 390 px) + smoke HTTP de la tarea 2. Sin Playwright | Confirmada |
| 5 | Cierre del módulo | `docs/dev/pagos/cierre-del-modulo.md` solo si Hector lo pide, como en los otros módulos | Propuesta |

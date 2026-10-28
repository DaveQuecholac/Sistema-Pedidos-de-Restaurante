# Análisis — Tarea 3 · Pantalla de cuenta y demo (E4)

**Rama:** `dev/totales`  
**Sprint:** 3 (RF4). Tarea 3 de 3. Solo esta. Cierra la demo del Sprint 3.  
**Fecha:** 4 de octubre de 2026  
**Estado:** acordado el 4 de octubre de 2026. Empieza cuando la tarea 2 esté cerrada.  
**Plan:** `plan-de-accion.md` en esta carpeta.  
**Reglas de cálculo:** `../01-calculo-en-el-nucleo/analisis.md`. **Contrato HTTP:** sección 6 de `../02-persistencia-y-api/analisis.md`.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Qué pide la tarea

Tarjetas de Trello:

- «Pantalla de cuenta (desglose)»: desglose legible; ajustar propina y descuento; los totales vienen del servidor; carga y errores visibles.
- «Demo Sprint 3»: cambiar propina o descuento → totales estables; regresión de menú, comanda y cocina.

## 2. Qué deja la tarea 2

- `GET /orders/:orderId/totals`, `PUT …/discount`, `PUT …/tip`, que responden el desglose con `adjustable`.
- `GET /orders/:id` igual que en el Sprint 2.
- Errores con `{ code, message }`: 400, 404, 409, 422.

## 3. Qué hay en la web

| Pieza | Uso en esta tarea |
|-------|-------------------|
| `app/orders/order-api.ts` | Se reusa `OrderApiError`, `OrderApiConfigError` y `getOrder`. `request` no se exporta hoy; si el cliente nuevo lo necesita, exportarlo es un cambio de una línea que se lista antes |
| `app/orders/order-view.ts` | Se reusa `originLabel`, `statusLabel`, `errorText` |
| `app/menu/menu-amount.ts` | Se reusa `centavosToLabel`, `basisPointsToPercentLabel`, `pesosToCentavos`, `percentToBasisPoints`. No se modifica |
| `app/orders/orders.module.css` | Estilo de comandas; se agregan las clases de la tabla de desglose |
| `app/orders/[orderId]/order-detail-screen.tsx` | Solo gana el enlace «Ver cuenta» |

## 4. La pantalla

Ruta `/orders/[orderId]/totals`, título «Cuenta». Rol: mesero o caja.

| Zona | Qué muestra | De dónde sale |
|------|-------------|---------------|
| Encabezado | «Mesa 5 · Cuenta» o «Pedido externo UBER-1 · Cuenta», insignia de estado, enlaces «Comanda» y «Comandas» | `GET /orders/:id` |
| Desglose | Cada línea: nombre, «× cantidad», importe de línea. Luego Subtotal, Descuento (con «−» y su etiqueta), una fila por tasa de impuesto, Propina, **Total** | `GET …/totals` |
| Descuento | «Sin descuento», «Porcentaje», «Monto fijo» + campo + «Aplicar» | `PUT …/discount` |
| Propina | «Sin propina», atajos 10 %, 15 %, 20 %, «Otro %», «Monto fijo» | `PUT …/tip` |
| Avisos | Descuento topado; cuenta no ajustable; errores | Desglose y errores de la API |

Reglas:

- **La pantalla no calcula.** Cada importe es un `centavosToLabel` sobre un `amount` que mandó el servidor. No suma, no resta, no multiplica, no aplica porcentajes.
- La pantalla **sí convierte** lo que se escribe: «10» % → `1000` puntos base, «50» pesos → `5000` centavos, con las funciones del admin del menú. Eso es entrada, no cálculo.
- Los formularios se dibujan solo si `totals.adjustable`. Si no, aviso «La cuenta ya no se puede ajustar».
- El formulario muestra lo vigente: si hay descuento del 10 %, aparece «Porcentaje» con «10».
- Si el descuento fijo se topó (`requested` > `amount`): «El descuento se ajustó al subtotal.»

## 5. Estados y errores

| Situación | Qué hace la pantalla |
|-----------|----------------------|
| Cargando | «Cargando cuenta…» |
| 404 de la orden o de los totales | «Esa comanda no existe» y enlace a `/orders` |
| API caída o error al cargar | Mensaje y «Reintentar». Ningún número inventado |
| Texto inválido en el formulario | Mensaje local; no sale petición |
| Éxito de un ajuste | Se usa el desglose de la respuesta. No se vuelve a pedir |
| 409 (`OrderTotalsNotAdjustableError`, `OrderConcurrencyError`) | Mensaje y se vuelven a pedir orden y totales |
| 422 | Mensaje; el desglose se queda como lo confirmó el servidor |
| Petición en curso | Botones deshabilitados |

Textos en español para los códigos nuevos:

| Código | Texto |
|--------|-------|
| `OrderTotalsNotAdjustableError` | La cuenta ya no se puede ajustar. |
| `InvalidPercentageError` | El porcentaje tiene que ser de 0.01 a 100. |
| `InvalidDiscountError` | El descuento tiene que ser mayor que cero. |
| `InvalidTipError` | La propina tiene que ser mayor que cero. |
| `InvalidMoneyError` | El monto no es válido. |
| `MoneyOverflowError` | La cuenta supera el monto máximo que se puede registrar. |

Los demás códigos usan `errorText` de comandas (incluye `OrderConcurrencyError`).

## 6. Demo del sprint

1. Abrir una comanda, agregar Tacos × 2 con Queso y Agua × 1.
2. «Ver cuenta»: subtotal $145.00, impuesto 16 % $19.20, total $164.20.
3. Descuento 10 % y propina 10 %: total $160.83.
4. Cambiar la propina a 15 % y regresarla a 10 %: otra vez $160.83.
5. Recargar: mismos números.
6. Mandar a cocina y ajustar la propina: se puede; las líneas siguen bloqueadas.

Los números salen de la sección 5.8 del análisis de la tarea 1.

## 7. Fuera de alcance

Cobro y cierre (Sprint 4), ticket o impresión, dividir la cuenta, totales en la lista de comandas o en cocina, importes en el detalle de la comanda, UI final.

## 8. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Cálculo en el cliente «para mostrar rápido» | Revisión R9 con `rg`; las funciones de vista solo dan formato |
| Romper comandas o cocina | El detalle solo gana un enlace (R11); regresión B18 |
| Proceso PM2 viejo en la demo | `pnpm dev:restart` antes del recorrido |
| La carta cambió y los números no cuadran | Paso 0 del plan verifica precios y tasas |

# Plan de acción — Tarea 3 · Pantalla de cuenta y demo (E4)

**Rama:** `dev/totales`  
**Sprint:** 3 (RF4). Tarea 3 de 3. Solo esta. Cierra la demo del Sprint 3.  
**Fecha:** 4 de octubre de 2026  
**Estado:** cerrada el 4 de octubre de 2026 (Pasos 0–5 + B1–B18 + CTTM).  
**Análisis:** `analisis.md` en esta carpeta.  
**Reglas de trabajo:** sección 5 de `../01-calculo-en-el-nucleo/plan-de-accion.md`.  
**Maestro:** `.cursor/rules/dev-spec-gen1.mdc`.

## 1. Resultado

En `https://restaurante.localhost`, desde el detalle de una comanda se abre «Cuenta». Se ve cada línea con su importe, el subtotal, el descuento, el impuesto por tasa, la propina y el total. Se aplica un descuento y una propina; repetir los mismos ajustes da los mismos centavos; recargar no cambia nada. Una orden cancelada muestra su cuenta sin formularios. La pantalla no calcula ningún importe. Menú, comandas y cocina siguen igual.

## 2. No se toca

- `apps/api/**`, salvo correr sus pruebas.
- `apps/web/app/menu/**`. Se importan funciones de `menu-amount.ts`; no se modifican.
- `apps/web/app/kitchen/**`, `apps/web/app/orders/orders-screen.tsx`, `order-view.ts`.
- `order-detail-screen.tsx`, salvo el enlace «Ver cuenta».
- `order-api.ts`, salvo exportar `request` si el cliente nuevo lo necesita (se avisa antes).
- Los cinco platos de la demo.

## 3. Decisiones

| Tema | Decisión |
|------|----------|
| Ruta | `/orders/[orderId]/totals`; `page.tsx` resuelve `params` (Next 15) y pasa `orderId` |
| Datos | `fetch` del navegador a `NEXT_PUBLIC_API_URL`, como comandas. Sin Route Handler |
| Carga | `getOrder` y `getOrderTotals` en paralelo |
| Tras un ajuste exitoso | Se usa el desglose de la respuesta |
| Tras un 409 | Mensaje y se vuelven a pedir orden y totales |
| Tras un 422 u otro | Mensaje; el desglose no cambia |
| Formularios | Solo si `totals.adjustable` |
| Importes | `centavosToLabel` sobre lo que mandó el servidor. Sin aritmética |
| Entrada | `percentToBasisPoints` y `pesosToCentavos` del menú |
| Atajos de propina | 10 %, 15 %, 20 % |
| Estilo | Clases de `orders.module.css` más tabla de desglose y fila de total |

## 4. Archivos

- `apps/web/app/orders/[orderId]/totals/page.tsx`
- `apps/web/app/orders/[orderId]/totals/totals-screen.tsx` (`'use client'`)
- `apps/web/app/orders/[orderId]/totals/totals-api.ts` · `totals-api.spec.ts`
- `apps/web/app/orders/[orderId]/totals/totals-view.ts` · `totals-view.spec.ts`
- `apps/web/app/orders/orders.module.css`
- `apps/web/app/orders/[orderId]/order-detail-screen.tsx` (solo el enlace)

## 5. Pasos

Cada paso cierra con `pnpm --filter @restaurante/web test` y `pnpm --filter @restaurante/web typecheck` en verde.

### Paso 0 — Línea base

1. `pnpm dev:restart`. `/menu`, `/orders`, `/kitchen` → 200.
2. Web test → **36** (o el número vigente). Typecheck.
3. `curl` a `GET /orders/:id/totals` de la orden `D3-API-1` de la tarea 2 → 200 con el desglose.
4. `GET /menu-items`: Tacos `4500`/`1600` con Queso `1500`; Agua `2500`/`0`. Si cambiaron, recalcular B2–B11.

**Línea base — 4 de octubre de 2026**

| Comando | Resultado |
|---------|-----------|
| `pnpm dev:restart` | api + web online |
| `/menu`, `/orders`, `/kitchen` | 200 |
| `pnpm --filter @restaurante/web test` | **36** passed |
| `pnpm --filter @restaurante/web typecheck` | OK |
| `GET …/totals` `D3-API-1` (`3d144fa4-…`) | 200; total **16736**; descuento 10 %; propina 15 %; `adjustable` true |
| Carta | Tacos `4500`/`1600` Queso `1500`; Agua `2500`/`0` — sin recalcular B2–B11 |

Piso web: **36**. No puede bajar.

### Paso 1 — Cliente HTTP

`totals-api.ts`: `getOrderTotals`, `setOrderDiscount`, `setOrderTip`; tipos `OrderTotalsJson`, `AdjustmentBody` alineados al presentador de la tarea 2. Pruebas W10–W16 con `fetch` simulado.

**Hecho — 4 de octubre de 2026**

| Chequeo | Resultado |
|---------|-----------|
| `totals-api.ts` + `totals-api.spec.ts` | W10–W16 |
| `order-api.ts` | exporta `request`; admite `PUT` |
| Web test | **43** passed (36 + 7) |
| Typecheck | OK |
| App / UI | sin pantalla aún |

### Paso 2 — Vista pura

`totals-view.ts`:

- `taxLabel(tax)` → «Impuesto 16.00 %»
- `discountLabel(discount)` → «Descuento 10.00 %» / «Descuento (monto fijo)»
- `tipLabel(tip)` → «Propina 15.00 %» / «Propina (monto fijo)»
- `discountCapNotice(totals)` → aviso si `requested` > `amount`; si no, `null`
- `parseAdjustment(mode, text)` → `AdjustmentBody` o error local
- `TIP_PRESETS` → `[1000, 1500, 2000]`
- `totalsErrorText(error)` → textos de la sección 5 del análisis; si no, `errorText`
- `totalsView(state)` → `loading`, `error`, `missing`, `ready`

Pruebas V14–V24.

**Control:** hacer que `discountCapNotice` compare con `>=` → V17 falla. Restaurar.

**Hecho — 4 de octubre de 2026**

| Chequeo | Resultado |
|---------|-----------|
| `totals-view.ts` + `totals-view.spec.ts` | V14–V24 |
| Control V17 (`>=`) | falla como se espera; restaurado |
| Web test | **54** passed (43 + 11) |
| Typecheck | OK |
| App / UI | sin pantalla aún |

### Paso 3 — Pantalla

`page.tsx` y `totals-screen.tsx` con el comportamiento de las secciones 4 y 5 del análisis.

**Hecho — 4 de octubre de 2026**

| Chequeo | Resultado |
|---------|-----------|
| Archivos | `page.tsx`, `totals-screen.tsx`; CSS `breakdown` / `formsStack` |
| Web test | **54** passed |
| Typecheck | OK |
| Ruta | `/orders/:id/totals` → 200 |
| App | desglose visible por URL directa; enlace «Ver cuenta» aún no (Paso 4) |

### Paso 4 — Enlace en el detalle

«Ver cuenta» en el encabezado de `order-detail-screen.tsx`, junto a «Comandas». Nada más en ese archivo.

**Hecho — 4 de octubre de 2026**

| Chequeo | Resultado |
|---------|-----------|
| Diff `order-detail-screen.tsx` | +1 línea: enlace «Ver cuenta» |
| Web test | **54** passed |
| Typecheck | OK |
| `pnpm dev:restart` | online; detalle 200 |
| App | enlace en el encabezado junto a «Comandas» |

### Paso 5 — Verificación, demo y cierre del sprint

1. Web: test y typecheck. API: `env -u DATABASE_URL pnpm --filter @restaurante/api test` y typecheck.
2. Revisión R8–R12.
3. `pnpm dev:restart` (obligatorio tras cambios visibles en web).
4. Recorrido B1–B18 en 1280 px y 390 px.
5. Corrida CTTM en `docs/desarrollo/pruebas-cttm.md` con las tres tareas del sprint.
6. `docs/README.md` al día.
7. Si Hector lo pide, `docs/dev/totales/cierre-del-modulo.md` en lenguaje del local, como los de menú y comanda.
8. Anotar la sección 10.

**Hecho — 4 de octubre de 2026**

| Chequeo | Resultado |
|---------|-----------|
| Web test / typecheck | **54** / OK |
| API test / typecheck | **309** + 30 skipped / OK |
| `test:db` | **30** |
| R8–R12 | OK (R8 solo texto de home) |
| B1–B18 | PASS en 1280 y 390 (ver §7/§10) |
| CTTM | anotada en `docs/desarrollo/pruebas-cttm.md` |
| `docs/README.md` | ya listaba las 3 tareas de totales |
| `cierre-del-modulo.md` | no pedido |

## 6. Catálogo sin navegador

### Cliente HTTP

| Id | Dado | Entonces |
|----|------|----------|
| W10 | Falta `NEXT_PUBLIC_API_URL` | `OrderApiConfigError`, sin `fetch` |
| W11 | `getOrderTotals('o 1')` | `GET /orders/o%201/totals` |
| W12 | `setOrderDiscount(id, { kind: 'percentage', basisPoints: 1000 })` | `PUT …/discount` con `{"discount":{"kind":"percentage","basisPoints":1000}}` exacto |
| W13 | `setOrderDiscount(id, null)` | cuerpo `{"discount":null}` |
| W14 | `setOrderTip(id, { kind: 'fixedAmount', amount: 2000 })` | `PUT …/tip` con ese cuerpo |
| W15 | Respuesta 409 `{ code, message }` | `OrderApiError` con status y `code` |
| W16 | `fetch` lanza | «No se pudo contactar el API.» |

### Vista

| Id | Dado | Entonces |
|----|------|----------|
| V14 | Impuesto de 1600 y de 0 | «Impuesto 16.00 %» / «Impuesto 0.00 %» |
| V15 | Descuento `percentage` 1000; `fixedAmount` | «Descuento 10.00 %» / «Descuento (monto fijo)» |
| V16 | Propina `percentage` 1500; `fixedAmount` | «Propina 15.00 %» / «Propina (monto fijo)» |
| V17 | Fijo con `requested` 20000 y `amount` 14500; fijo con los dos en 5000 | «El descuento se ajustó al subtotal.» / `null` |
| V18 | `parseAdjustment('percentage', '10')`, `'10.5'` | `basisPoints` 1000, 1050 |
| V19 | `parseAdjustment('fixedAmount', '50')`, `'50.25'` | `amount` 5000, 5025 |
| V20 | `''`, `'abc'`, `'10.123'`, `'-5'` | error local, sin cuerpo |
| V21 | `TIP_PRESETS` | `[1000, 1500, 2000]` |
| V22 | `OrderTotalsNotAdjustableError`, `InvalidPercentageError`, `InvalidDiscountError`, `InvalidTipError`, `InvalidMoneyError`, `MoneyOverflowError` | textos de la sección 5 del análisis |
| V23 | `OrderConcurrencyError`; código desconocido | texto de `errorText`; `code: message` |
| V24 | Cargando, error, 404, listo | `loading`, `error`, `missing`, `ready` |

## 7. Recorrido en el navegador

Con API y web recién reiniciados. Prefijo de mesa `D3-`. Anotar pasó o falló por ítem, con fecha.

| Id | Qué hacer | Entonces | Resultado |
|----|-----------|----------|-----------|
| B1 | Comandas → abrir mesa `D3-1`; Tacos × 2 con Queso; Agua × 1 | Detalle con dos líneas y enlace «Ver cuenta» | **Pasó** 4 oct 2026 (1280 y 390) |
| B2 | «Ver cuenta» | Líneas $120.00 y $25.00; Subtotal **$145.00**; Impuesto 0.00 % $0.00; Impuesto 16.00 % **$19.20**; Total **$164.20** | **Pasó** |
| B3 | Descuento 10 % | Descuento −$14.50; Impuesto 16 % $17.28; Total **$147.78** | **Pasó** |
| B4 | Propina 10 % | Propina $13.05; Total **$160.83** | **Pasó** |
| B5 | Propina 15 % y luego otra vez 10 % | $167.36 y de nuevo **$160.83** | **Pasó** |
| B6 | Recargar la página | Mismos números; el formulario muestra 10 % y 10 % | **Pasó** |
| B7 | Descuento monto fijo `50` | Descuento −$50.00; Impuesto 16 % $12.58; Propina $9.50; Total **$117.08** | **Pasó** |
| B8 | Descuento monto fijo `200` | Aviso de tope; Descuento −$145.00; impuestos $0.00; propina $0.00; Total **$0.00** | **Pasó** |
| B9 | «Sin descuento» y «Sin propina» | Total **$164.20** | **Pasó** |
| B10 | Porcentaje `abc`; porcentaje `150` | Mensaje local sin petición; mensaje del 422 sin cambiar el desglose | **Pasó** |
| B11 | Volver a la comanda, agregar Agua × 1, volver a la cuenta y aplicar descuento 10 % | Subtotal $170.00; descuento −$17.00 | **Pasó** |
| B12 | Enviar a cocina; en la cuenta, propina 15 % | Se ajusta; en la comanda las líneas siguen bloqueadas | **Pasó** |
| B13 | Dos pestañas en la cuenta; en la 1, propina 20 %; en la 2 (vieja), descuento 5 % | La 2 muestra el aviso de cambio, recarga y muestra la propina de la 1 | **Pasó con matiz** (tip 20 % + descuento 5 % en pestaña 2; 409 de carrera rara en UI porque cada PUT relee; H38 lo cubre) |
| B14 | Comanda `D3-2` con un plato; cancelarla; abrir su cuenta | Desglose visible; «La cuenta ya no se puede ajustar»; sin formularios | **Pasó** |
| B15 | `/orders/no-existe/totals` | «Esa comanda no existe» y enlace | **Pasó** |
| B16 | Detener solo `restaurante-api` y recargar la cuenta | Error y «Reintentar»; ningún número. Al volver la API, «Reintentar» muestra la cuenta | **Pasó** |
| B17 | 1280 px y 390 px en la cuenta | Una columna en estrecho; formularios alcanzables; sin scroll horizontal | **Pasó** |
| B18 | Regresión: `/menu`; `/orders`; detalle; `/kitchen` (poner en cocción y marcar lista la orden de B12) | Igual que en el Sprint 2 | **Pasó** |

B2–B11 usan los números de la sección 5.8 del análisis de la tarea 1.

## 8. Revisión de código

| Id | Entonces |
|----|----------|
| R8 | `rg "@restaurante/api\|drizzle" apps/web/app` sin imports nuevos |
| R9 | `rg "amount \+\|amount -\|\* .*basisPoints\|reduce\(\|Math\." "apps/web/app/orders/[orderId]/totals"` sin cálculo de importes |
| R10 | `git diff --stat apps/web/app/menu apps/web/app/kitchen apps/web/app/orders/orders-screen.tsx apps/web/app/orders/order-view.ts` vacío |
| R11 | El diff de `order-detail-screen.tsx` es solo el enlace |
| R12 | Los formularios dependen de `totals.adjustable`, no de comparar `status` |

## 9. Hecho cuando

- [x] W10–W16 y V14–V24 pasan; las 36 previas siguen
- [x] El control del paso 2 falló al romper y pasó al restaurar
- [x] B1–B18 anotados con fecha, en 1280 px y 390 px
- [x] R8–R12 se cumplen
- [x] Pruebas y typecheck de API y web pasan
- [x] La demo del Sprint 3 se hace de punta a punta y da los mismos números al repetir
- [x] Corrida CTTM nueva; `docs/README.md` al día

## 10. Cierre

Cerrado el 4 de octubre de 2026. Cierra el Sprint 3 (RF4).

| Familia | Comando / chequeo | Resultado |
|---------|-------------------|-----------|
| Línea base | paso 0 | Web 36; carta OK; totales `D3-API-1` 16736 |
| C Web | `pnpm --filter @restaurante/web test` + `typecheck` | **54** passed; OK |
| C API | `env -u DATABASE_URL pnpm --filter @restaurante/api test` + `typecheck` | **309** + 30 skipped; OK |
| T DB | `pnpm --filter @restaurante/api test:db` | **30** |
| T Sistema | home, `/menu`, `/orders`, `/kitchen`, cuenta | 200; cuenta con desglose |
| B1–B18 | Recorrido §7 | PASS 1280 y 390 (B13 con matiz) |
| R8–R12 | Revisión §8 | OK |
| CTTM | `docs/desarrollo/pruebas-cttm.md` | Corrida Sprint 3 / tarea 3 |

| Id | order id | Estado final |
|----|----------|--------------|
| B1 (`D3-1`) 1280 | `4a411348-c308-47dc-ba3c-dce6479c3d8f` | cuenta ajustada; luego cocina |
| B14 (`D3-2`) 1280 | `9ada84d4-6907-4158-a95d-7aa35ee3f7d7` | `CANCELLED`; sin formularios |
| B1 (`D3-1`) 390 | `6fe5217d-807a-4076-95ea-6c274a7035aa` | mismo recorrido |
| B14 (`D3-2`) 390 | `d74f9286-4525-431e-8b0a-f27f236d8007` | `CANCELLED` |

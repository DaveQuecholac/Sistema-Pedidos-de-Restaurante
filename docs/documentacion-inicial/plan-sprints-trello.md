# Plan de sprints y tarjetas (Trello)
## Sistema de Pedidos de Restaurante

**Para:** Scrum Master / quien carga el tablero  
**Duración:** ~2 meses (8 semanas)  
**Cadencia:** 4 sprints × 2 semanas  
**Regla de oro:** cada sprint se **demuestra en el navegador** (funcional + pantalla usable). Lo de sprints anteriores no se rompe.

La base técnica del proyecto ya está lista. Este plan es la **implementación del producto**.

---

## Cómo armar el tablero en Trello

### Listas sugeridas

| Lista | Para qué |
|-------|----------|
| **Backlog** | Todo lo que aún no entra al sprint |
| **Sprint actual** | Tarjetas del sprint en curso |
| **En progreso** | Lo que alguien está haciendo |
| **En revisión / Demo** | Listo para mostrar al equipo |
| **Hecho** | Cerrado en el sprint |

*(Opcional)* listas por sprint: `Sprint 1`, `Sprint 2`, `Sprint 3`, `Sprint 4` — o un tablero por sprint.

### Etiquetas (labels)

| Color / nombre | Significado |
|----------------|-------------|
| **Menú** | Catálogo de platos |
| **Órdenes** | Comandas / mesas |
| **Cocina** | Estados y bloqueo de edición |
| **Cálculo** | Totales, propinas, descuentos |
| **Pagos** | Cobro y cierre |
| **UI** | Pantallas / experiencia |
| **Backend** | Lógica y API del servidor |
| **Demo** | Criterio de demostración del sprint |

### Estructura de cada tarjeta

1. **Título** claro (copiar de las listas de abajo).  
2. **Descripción** breve: qué se ve / qué se puede hacer al terminar.  
3. **Checklist** con las subtareas.  
4. **Etiquetas** del módulo.  
5. Mover a la lista del **sprint** correspondiente.

---

## Épicas (crear primero como tarjetas o listas padre)

Créalas en el Backlog y márcalas como épica (o con etiqueta “Épica”).

| Épica | Requisito | Objetivo en una frase |
|-------|-----------|------------------------|
| **E0 Plataforma** | — | Base estable para guardar datos y conectar pantallas |
| **E1 Menú** | RF1 | Administrar platos, extras, precios e impuestos **con pantalla** |
| **E2 Órdenes** | RF2 | Abrir comanda por mesa o pedido externo **con pantalla** |
| **E3 Cocina / líneas** | RF3 | Agregar/cambiar líneas; al cocinar, ya no se edita **con pantalla** |
| **E4 Cálculo** | RF4 | Ver subtotal, descuentos, impuestos, propina y total **con pantalla** |
| **E5 Pagos** | RF5 | Cobrar (efectivo / tarjeta / digital simulados) y cerrar orden **con pantalla** |

---

## Resumen de sprints

| Sprint | Semanas | Qué se demuestra |
|--------|---------|------------------|
| **1** | 1–2 | Administrar el **menú** en la web |
| **2** | 3–4 | Abrir **comanda**, armar pedido y **enviar a cocina** (ya no se edita) |
| **3** | 5–6 | Ver **desglose de totales** (propina / descuento / impuestos) |
| **4** | 7–8 | **Cobrar**, cerrar la orden y recorrer el flujo completo |

Orden del negocio: **Menú → Comanda/Cocina → Totales → Cobro**.

---

## Criterio de “Hecho” (cada sprint)

Al cerrar el sprint se puede mostrar:

1. El flujo del sprint **de punta a punta** en la web.  
2. Datos reales (no solo pantallas de mentira).  
3. Navegación clara, mensajes de vacío y de error.  
4. Lo entregado en sprints anteriores **sigue funcionando**.

Checklist genérico en cada tarjeta grande:

- [ ] Lógica de negocio del módulo  
- [ ] Guardado / API si aplica  
- [ ] **Pantalla lista para demo**  
- [ ] No rompe demos anteriores  

---

## Sprint 1 — Semanas 1–2 · Menú administrable

**Épicas:** E0 + E1  
**Demo:** entrar a la web → crear/editar platos y modificadores → ver el catálogo actualizado.

### Qué entrega el sprint

- Catálogo de platos con precios e impuestos.  
- Modificadores (extras / exclusiones).  
- Guardado en base de datos.  
- **Pantalla de administración** del menú (listar, crear, editar, desactivar).

**Listo para demo si:** formularios claros, validación visible, lista usable en celular y escritorio.

---

## Sprint 2 — Semanas 3–4 · Comanda y cocina

**Épicas:** E2 + E3  
**Demo:** abrir orden → armar pedido con el menú del Sprint 1 → enviar a cocina → intentar editar y ver que está bloqueado.

### Qué entrega el sprint

- Abrir comanda (mesa o ID de pedido externo).  
- Agregar / modificar / quitar líneas.  
- Enviar a cocina.  
- Tras cocción: **no se pueden editar** las líneas.  
- **Pantallas** de comanda y estados visibles (Abierta / En cocción).

**Acumulado para mostrar:** Menú + Comanda/Cocina.

---

## Sprint 3 — Semanas 5–6 · Totales

**Épica:** E4  
**Demo:** en una orden, ajustar propina o descuento → ver el desglose; repetir y obtener los **mismos** números.

### Qué entrega el sprint

- Subtotal, descuentos, impuestos, propina opcional, total.  
- Cálculo estable (mismos datos → mismo resultado).  
- **Pantalla de cuenta** con el desglose legible.

**Acumulado:** Menú + Comanda + Totales.

---

## Sprint 4 — Semanas 7–8 · Cobro y cierre

**Épica:** E5  
**Demo:** menú → mesa → líneas → cocina → totales → cobrar (los 3 medios) → orden cerrada.

### Qué entrega el sprint

- Cierre de orden.  
- Cobro simulado: efectivo, tarjeta, pasarela digital.  
- **Pantalla de cobro** con resultado claro.  
- Recorrido completo pulido (errores, vacíos, navegación).

**Al cerrar este sprint:** producto MVP listo para demostrar de punta a punta.

---

## Fuera de alcance (no crear tarjetas de esto)

- Apps de delivery reales de terceros  
- Pagos reales en producción  
- App móvil nativa  
- Login / usuarios avanzados  
- Microservicios  

---

## Lista copy-paste para Trello

Copiar título → nueva tarjeta. Pegar el checklist en la descripción o como checklist de Trello. Asignar etiqueta y sprint.

---

### ÉPICAS (crear una vez)

```
[Épica] E0 Plataforma — base de datos y conexión pantallas
[Épica] E1 Menú — platos, modificadores, precios e impuestos + pantalla admin
[Épica] E2 Órdenes — abrir comanda (mesa / pedido externo) + pantalla
[Épica] E3 Cocina — líneas y bloqueo al cocinar + pantalla
[Épica] E4 Cálculo — totales, propina, descuentos, impuestos + pantalla
[Épica] E5 Pagos — cobro simulado y cierre de orden + pantalla
```

---

### SPRINT 1 — tarjetas

```
[S1] Preparar base de datos y conexión del sistema
[S1] Modelo de menú: platos, modificadores, precios e impuestos
[S1] Operaciones para crear, listar, editar y desactivar platos
[S1] Guardar el menú en base de datos
[S1] Endpoints / API del menú
[S1] Pantalla admin de menú (listar, crear, editar, desactivar)
[S1] Demo Sprint 1 — catálogo administrable en el navegador
```

**Checklists sugeridos**

Preparar base de datos:

```
- Conexión a base de datos lista
- Tablas del menú creadas
- Arranque de API y web sin errores
- Smoke básico OK
```

Modelo de menú:

```
- Plato con precio e impuestos
- Modificador (extra / exclusión)
- Reglas básicas validadas
```

Operaciones de menú:

```
- Crear plato
- Listar platos
- Editar plato
- Desactivar plato
- Probar sin pantalla (pruebas internas)
```

Guardar menú:

```
- Persistencia real (no solo memoria)
- Datos se mantienen al reiniciar
```

API menú:

```
- Crear / listar / editar / desactivar por API
- Errores claros (no encontrado, datos inválidos)
```

Pantalla admin:

```
- Listado de platos
- Formulario crear / editar
- Modificadores
- Mensajes de vacío y error
- Se ve bien en escritorio y móvil básico
```

Demo Sprint 1:

```
- Recorrido demo anotado (pasos)
- Criterio de hecho del sprint cumplido
```

---

### SPRINT 2 — tarjetas

```
[S2] Ciclo de vida de la orden (estados)
[S2] Regla: no editar líneas cuando está en cocción
[S2] Abrir orden (mesa o ID externo)
[S2] Agregar, modificar y cancelar líneas + enviar a cocina
[S2] Guardar órdenes en base de datos
[S2] API de órdenes y cocina
[S2] Pantalla de comanda (abrir, líneas, cocina, bloqueo)
[S2] Demo Sprint 2 — mesa → cocina en el navegador
```

**Checklists sugeridos**

Estados de la orden:

```
- Abierta → En cocción → Lista → Cerrada
- Cancelada según reglas
- Transiciones claras
```

Regla de cocina:

```
- En Abierta se pueden editar líneas
- En cocción se rechaza la edición
- Mensaje claro al usuario
```

Abrir orden:

```
- Por número de mesa
- Por ID de pedido externo
- Misma experiencia de negocio
```

Líneas y cocina:

```
- Agregar línea
- Modificar cantidad / quitar
- Enviar a cocina
```

Guardar órdenes:

```
- Orden y líneas persistidas
- Se recuperan después de reiniciar
```

API órdenes:

```
- Abrir orden
- Líneas
- Enviar a cocina
- Errores de negocio entendibles
```

Pantalla comanda:

```
- Abrir comanda (mesa / externo)
- Elegir platos del menú (Sprint 1)
- Armar pedido
- Botón enviar a cocina
- UI bloqueada en cocción + mensaje
- Estado visible de la orden
```

Demo Sprint 2:

```
- Menú → abrir → líneas → cocina → bloqueo
- Regresión: el admin de menú sigue funcionando
```

---

### SPRINT 3 — tarjetas

```
[S3] Dinero / montos sin errores de redondeo raros
[S3] Descuentos, impuestos y propina
[S3] Calcular totales de la orden
[S3] API de desglose de totales
[S3] Pantalla de cuenta (desglose)
[S3] Demo Sprint 3 — totales estables en el navegador
```

**Checklists sugeridos**

Montos:

```
- Cálculos consistentes
- Sin “números raros” de centavos
```

Descuentos / impuestos / propina:

```
- Descuento (si aplica en el MVP)
- Impuestos
- Propina opcional
- Mismos datos → mismos totales
```

Calcular totales:

```
- Desglose completo sobre la orden
- Probado con casos simples
```

API desglose:

```
- Devuelve subtotal, descuento, impuesto, propina, total
```

Pantalla de cuenta:

```
- Desglose legible
- Ajustar propina / descuento (si aplica)
- Totales vienen del servidor (la pantalla solo muestra)
- Carga y errores visibles
```

Demo Sprint 3:

```
- Cambiar propina/descuento → totales estables
- Regresión: menú + comanda + cocina
```

---

### SPRINT 4 — tarjetas

```
[S4] Definir cómo se registra un cobro
[S4] Medios de cobro: efectivo, tarjeta y digital (simulados)
[S4] Cerrar orden (calcular → cobrar → cerrada)
[S4] API de cierre / pago
[S4] Pantalla de cobro
[S4] Pulido del recorrido completo (UX)
[S4] Demo Sprint 4 — MVP completo presentable
```

**Checklists sugeridos**

Registro de cobro:

```
- Contrato claro de “cobrar”
- Resultado éxito / fallo
```

Medios de cobro:

```
- Efectivo (simulado)
- Tarjeta (simulado)
- Pasarela digital (simulado)
- Se puede cambiar de medio sin rehacer todo
```

Cerrar orden:

```
- Calcula totales si hace falta
- Cobra
- Guarda
- Pasa a Cerrada
- No permite más cambios de negocio
```

API cierre:

```
- Elegir medio de pago
- Respuesta clara de cobro
```

Pantalla de cobro:

```
- Elegir medio
- Confirmar
- Ver resultado
- Orden cerrada, sin seguir editando
```

Pulido UX:

```
- Navegación Menú → Comanda → Totales → Cobro
- Vacíos y errores en todo el flujo
- Presentable en demo
```

Demo Sprint 4:

```
- Flujo completo en navegador
- Probar los 3 medios de cobro
- Regresión sprints 1–3
- MVP listo para mostrar
```

---

## Pasos rápidos para el Scrum Master

1. Crear el tablero y las **listas**.  
2. Crear las **6 épicas** (bloque ÉPICAS).  
3. Crear las **etiquetas**.  
4. Pegar las tarjetas del **Sprint 1** (y dejar 2–4 en Backlog o en listas Sprint 2–4).  
5. En cada tarjeta: checklist + etiqueta + asignar al sprint.  
6. En planning: mover el sprint actual a **Sprint actual**.  
7. En review: la tarjeta **Demo Sprint N** debe poder mostrarse en el navegador.

---

## Alternativa: 8 sprints de 1 semana

Si el equipo prefiere semanas cortas, partir igual el trabajo:

| Sem | Qué se demuestra |
|-----|------------------|
| 1 | Base + modelo de menú |
| 2 | **Pantalla admin de menú** (cierra RF1) |
| 3 | Estados de orden + reglas de cocina |
| 4 | **Pantalla comanda/cocina** (cierra RF2–RF3) |
| 5 | Cálculo de montos y reglas |
| 6 | **Pantalla de totales** (cierra RF4) |
| 7 | Cobro y cierre (backend) |
| 8 | **Pantalla de cobro + demo completa** (cierra RF5 / MVP) |

Las mismas tarjetas sirven; solo se reetiquetan por semana.

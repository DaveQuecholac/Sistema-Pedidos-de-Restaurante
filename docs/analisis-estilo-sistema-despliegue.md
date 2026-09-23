# Análisis: estilo de arquitectura del sistema y patrón de despliegue
## Sistema de Pedidos de Restaurante

**Fecha:** 17 de septiembre de 2026  
**Base:** `documentacion-inicial.md`, `analisis-arquitectura.md`  
**Estado del proyecto:** solo documentación; sin código, sin servicios desplegados, sin infraestructura definida.  
**Decisión previa:** Hexagonal (Ports & Adapters) como patrón de diseño interno.  
**Decisión de este análisis:** Monolito modular + despliegue único (un solo artefacto ejecutable).

---

## 1. Qué se está decidiendo aquí

Ya quedó definido **cómo se estructura el código por dentro** (Hexagonal).

Ahora se define:

| Pregunta | Nombre típico | Qué responde |
|----------|---------------|--------------|
| ¿Cómo se organiza el sistema como un todo? | Estilo de arquitectura del sistema | ¿Un solo sistema, varios servicios, eventos, etc.? |
| ¿Cómo se empaqueta y corre en producción/academia? | Patrón de despliegue | ¿Una app, varios contenedores/servicios, serverless…? |

Hexagonal **no sustituye** esta decisión: puede vivir dentro de un monolito o de varios microservicios.

---

## 2. Qué implica lo ya documentado

Del material actual se deduce:

1. **Un dominio cohesivo:** menú, orden/comanda, cocina, cálculo y cobro (RF1–RF5) forman un mismo flujo de negocio.
2. **Varios canales de entrada, no varios productos:** mesa, para llevar y delivery son *adaptadores*, no necesariamente sistemas independientes.
3. **Varios medios de cobro:** también son *adaptadores de salida* detrás del mismo caso de uso de cierre.
4. **Prioridad = aislar reglas**, no escalar equipos ni desplegar por servicio.
5. **Proyecto académico / fase inicial:** aún no hay código ni evidencia de carga, equipos múltiples o SLAs por módulo.

Conclusión: el problema pide **desacoplar infraestructura**, no **partir el sistema en muchos despliegues**.

---

## 3. Opciones evaluadas

### 3.1 Monolito clásico (una sola app sin módulos claros)

- **Pros:** simple de arrancar, un solo despliegue, fácil de probar al inicio.
- **Contras:** si no se modula, el núcleo hexagonal se mezcla con UI/BD y se pierde el beneficio ya decidido.
- **Veredicto:** viable como punto de partida técnico, pero insuficiente como estilo objetivo.

### 3.2 Monolito modular (recomendado)

- **Qué es:** una sola aplicación desplegable, dividida en módulos/bounded contexts lógicos (menú, órdenes, cocina, pagos), con fronteras claras y núcleo hexagonal.
- **Pros:**
  - Encaja con RF1–RF5 en un solo flujo de pedido.
  - Los canales y cobros se modelan como adaptadores, sin inventar microservicios.
  - Un solo proceso = transacciones más simples (abrir orden, agregar líneas, calcular, cobrar).
  - Bajo costo operativo para un proyecto universitario o MVP.
  - Si mañana se necesita partir algo (p. ej. pagos), los módulos ya tienen límites.
- **Contras:** escala vertical/horizontal del proceso completo; no aísla fallos por servicio.
- **Veredicto:** **mejor equilibrio** para el estado actual.

### 3.3 Microservicios

- **Pros:** despliegue independiente, escalado por servicio, aislamiento de fallos.
- **Contras (hoy):**
  - Complejidad de red, contratos, consistencia, observabilidad y DevOps.
  - RF1–RF5 están fuertemente acoplados por el ciclo de vida de una orden.
  - No hay evidencia de equipos separados ni de necesidad de desplegar menú vs. cobro por separado.
  - Hexagonal ya resuelve el cambio de proveedores sin exigir N servicios.
- **Veredicto:** **no recomendado** en esta fase.

### 3.4 Orientado a eventos (estilo primario)

- **Pros:** útil para notificar cocina, delivery o paneles en tiempo real.
- **Contras:** como estilo *principal* complica el cierre de orden y el cálculo determinista (RF4).
- **Veredicto:** puede ser un **complemento futuro** (p. ej. evento `OrdenEnviadaACocina`), no el estilo base.

### 3.5 Cliente–servidor / API

- **Rol:** patrón de interacción para el adaptador web (cliente UI ↔ API).
- **Veredicto:** se usará en el borde (adaptador de entrada), pero **no define** la arquitectura global del sistema.

---

## 4. Decisión

### Estilo de arquitectura del sistema

**Monolito modular.**

Una sola aplicación, con módulos internos alineados al dominio:

- Módulo Menú (RF1)
- Módulo Órdenes / Comandas (RF2, RF3)
- Módulo Cálculo / Pricing (RF4)
- Módulo Pagos / Cierre (RF5)
- (Opcional) Módulo Cocina / estado de preparación (soporte a RF3)

Cada módulo expone puertos; la infraestructura (HTTP, consola, BD, pasarelas) vive en adaptadores.

### Patrón de despliegue

**Despliegue único (single deployable):**

- Un artefacto (JAR, contenedor Docker único, o proceso de aplicación).
- Una base de datos principal al inicio (suficiente para el alcance actual).
- Varios adaptadores de entrada/salida **en el mismo proceso**, no como servicios separados.

Esquema conceptual:

```text
                    ┌─────────────────────────────────────┐
  Mesa / Web /      │         MONOLITO MODULAR            │
  Delivery /        │  ┌─────────┐  ┌──────────┐          │
  Consola  ────────►│  │ Adapt.  │  │  Núcleo  │          │
                    │  │ entrada │─►│ Hexagonal│          │
                    │  └─────────┘  │ (casos   │          │
                    │               │  de uso) │          │
                    │  ┌─────────┐  └────┬─────┘          │
  BD / Cobros ◄─────│  │ Adapt.  │◄──────┘                │
                    │  │ salida  │                        │
                    │  └─────────┘                        │
                    └─────────────────────────────────────┘
                         ↑ un solo despliegue ↑
```

---

## 5. Cómo convive con Hexagonal

| Capa de decisión | Elección |
|------------------|----------|
| Diseño interno del código | Hexagonal (puertos y adaptadores) |
| Estilo del sistema | Monolito modular |
| Despliegue | Único artefacto / un proceso |

Hexagonal responde: *¿quién depende de quién dentro del código?*  
Monolito modular responde: *¿cuántos sistemas desplegamos y cómo se parten lógicamente?*

---

## 6. Criterios que justifican la elección (basados en lo existente)

1. Documentación enfocada en **aislar reglas de venta**, no en particionar equipos ni tráfico.
2. Canales múltiples modelados como **adaptadores**, no como productos autónomos.
3. RF1–RF5 comparten el **mismo agregado de negocio** (la orden).
4. El repositorio hoy es **solo docs**: conviene maximizar claridad y minimizar ops.
5. Hexagonal ya permite cambiar BD o pasarela **sin** pasar a microservicios.

---

## 7. Evolución futura (sin comprometer la decisión actual)

Si más adelante aparecen necesidades reales (carga, equipos, compliance de pagos), se puede:

1. Extraer el módulo de Pagos a un servicio.
2. Añadir mensajería para cocina/delivery.
3. Separar el adaptador de un canal delivery de alto volumen.

El monolito modular + hexagonal deja esa puerta abierta **sin pagar el costo ahora**.

---

## 8. Conclusión

**Recomendación adoptada:**

- **Estilo de sistema:** monolito modular  
- **Patrón de despliegue:** despliegue único  
- **Diseño interno (ya decidido):** arquitectura hexagonal  
- **Patrones de diseño:** ver `analisis-patrones-diseno.md`

No se adoptan microservicios ni un estilo event-driven como base en esta fase.

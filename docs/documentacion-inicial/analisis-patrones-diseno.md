# Análisis: patrones de diseño
## Sistema de Pedidos de Restaurante

**Fecha:** 17 de septiembre de 2026  
**Base:** `documentacion-inicial.md`, `analisis-arquitectura.md`, `analisis-estilo-sistema-despliegue.md`  
**Marco ya decidido:** Hexagonal + monolito modular + despliegue único.  
**Enfoque:** pocos patrones, justificados por requisitos; no un catálogo GoF completo.

---

## 1. Cómo abordamos esta parte

Los patrones de diseño **no se eligen primero**. Se eligen porque un problema concreto del dominio o de los adaptadores lo pide.

Criterios de adopción:

1. Debe resolver un RF o un puerto hexagonal.
2. Debe simplificar pruebas o el cambio de infraestructura.
3. Si no aporta claridad, **no se usa**.

Con eso evitamos saturación de patrones y mantenemos el código legible para un proyecto académico / MVP.

---

## 2. Mapa de decisiones de arquitectura (resumen)

| Nivel | Decisión |
|-------|----------|
| Estilo del sistema | Monolito modular |
| Despliegue | Único |
| Diseño interno | Hexagonal (puertos y adaptadores) |
| Patrones de diseño | Los de la sección 3 (núcleo) + sección 4 (aplicación) |

---

## 3. Patrones del núcleo (dominio) — prioritarios

### 3.1 Domain Model / Aggregate

- **Para qué:** modelar `Orden` como agregado raíz con líneas, estado de cocina y reglas de edición.
- **RF:** RF2, RF3.
- **Por qué:** la regla “no editable tras iniciar cocción” debe vivir en el dominio, no en el controlador web.

### 3.2 State (estado de la orden / cocina)

- **Para qué:** estados explícitos (`ABIERTA`, `EN_COCCION`, `LISTA`, `CERRADA`, `CANCELADA`) y transiciones válidas.
- **RF:** RF3 (y cierre RF5).
- **Por qué:** evita `if` dispersos; cada estado define qué operaciones permite.

### 3.3 Strategy (estrategias intercambiables)

Usos claros en este sistema:

| Estrategia | Variantes | RF |
|------------|-----------|-----|
| Cobro | Efectivo, tarjeta, pasarela digital | RF5 |
| Descuento / promoción | Sin descuento, % promo, monto fijo, etc. | RF4 |
| (Opcional) Impuesto | Según jurisdicción o tipo de plato | RF1, RF4 |

- **Por qué:** el caso de uso fija el contrato; cada variante es un adaptador o una política inyectable.
- Encaja directo con Hexagonal: Strategy ≈ implementación detrás de un puerto.

### 3.4 Money / Value Object (cálculo determinista)

- **Para qué:** precios, subtotales, propinas, impuestos y totales como valores inmutables (p. ej. centavos + moneda), no `float`.
- **RF:** RF1, RF4.
- **Por qué:** el enunciado pide cálculo **determinista**; los value objects reducen errores de redondeo y acoplamiento a UI/BD.

### 3.5 Specification (opcional, si crece la validación)

- **Para qué:** reglas del tipo “¿esta línea se puede modificar?” o “¿este descuento aplica?”.
- **RF:** RF3, RF4.
- **Cuándo:** solo si las reglas se multiplican; al inicio puede bastar el Aggregate + State.

---

## 4. Patrones de aplicación e infraestructura

### 4.1 Ports & Adapters (ya es la arquitectura)

No es un “extra”: es el patrón marco. Todo lo demás se cuelga de puertos.

### 4.2 Repository

- **Para qué:** puerto `OrdenRepository`, `MenuRepository`, etc.; implementaciones en adaptadores (SQL, memoria, etc.).
- **RF:** RF1–RF5 (persistencia).
- **Por qué:** el núcleo no conoce la BD.

### 4.3 Adapter

- **Para qué:** HTTP/API, consola, delivery, pasarelas de pago, drivers de BD.
- **RF:** RF2 (canales), RF5 (cobros).
- **Por qué:** es la traducción literal del problema de negocio documentado.

### 4.4 Dependency Injection

- **Para qué:** componer casos de uso con repositorios y estrategias sin `new` duro en el dominio.
- **Por qué:** facilita tests (fakes/mocks) y el monolito modular.

### 4.5 Application Service / Use Case (Command-style)

- **Para qué:** un caso de uso por intención: `AbrirOrden`, `AgregarLinea`, `CalcularTotales`, `CerrarOrden`.
- **RF:** todos.
- **Por qué:** orquesta el agregado y los puertos; mantiene el hexágono usable desde cualquier adaptador de entrada.

### 4.6 Factory (selectivo)

- **Para qué:** crear una `Orden` según canal (mesa vs. ID externo) o seleccionar el procesador de pago.
- **RF:** RF2, RF5.
- **Cuándo:** cuando la creación tenga reglas; no fabricar factories por costumbre.

---

## 5. Patrones que NO adoptamos ahora

| Patrón | Motivo de aplazamiento |
|--------|------------------------|
| Observer / Event Bus como base | Útil luego para cocina/pantallas; no es necesario para RF1–RF5 iniciales. |
| CQRS completo | Exceso para un monolito académico con un solo modelo de lectura/escritura. |
| Abstract Factory / Prototype / Flyweight, etc. | Sin problema concreto que los justifique. |
| Singleton de dominio | Suele ocultar dependencias; preferir DI. |

---

## 6. Relación patrón ↔ requisito (guía rápida)

| RF | Patrones principales |
|----|----------------------|
| RF1 Menú | Domain Model, Value Object (precio/impuesto), Repository |
| RF2 Abrir orden | Use Case, Factory (canal), Repository, Adapter de entrada |
| RF3 Líneas y cocina | Aggregate, State, Specification (si hace falta) |
| RF4 Cálculo | Strategy (descuento/impuesto), Money/Value Object, Use Case |
| RF5 Cierre y pago | Strategy + Adapter de cobro, Use Case, Repository |

---

## 7. Orden de implementación sugerido

1. **Agregado `Orden` + State** (núcleo de RF2/RF3).  
2. **Value Objects de dinero** + cálculo (RF4).  
3. **Puertos Repository** + adaptador en memoria (tests).  
4. **Strategy de pago** + 2–3 adaptadores (RF5).  
5. **Adaptador web o consola** como driving adapter.  
6. Solo después: eventos, más strategies de promo, BD real.

---

## 8. Conclusión

**Cómo lo abordamos:** patrones **dirigidos por el dominio y por los puertos**, no por catálogo.

**Set mínimo adoptado:**

- Aggregate / Domain Model  
- State  
- Strategy  
- Value Object (Money)  
- Repository  
- Adapter  
- Use Case + Dependency Injection  
- Factory donde la creación lo pida  

Con Hexagonal + monolito modular, este conjunto cubre RF1–RF5 sin sobreingeniería.

# Análisis inicial de arquitectura
## Sistema de Pedidos de Restaurante

**Fecha:** 17 de septiembre de 2026  
**Base:** `documentacion-inicial.md`  
**Decisión:** Arquitectura Hexagonal (Ports & Adapters), con el núcleo organizado al estilo Clean Architecture.  
**Complementos:**  
- `arquitectura-hexagonal.md` (**guía canónica** de Ports & Adapters — lectura obligatoria al implementar)  
- `analisis-estilo-sistema-despliegue.md` (monolito modular + despliegue único)  
- `analisis-patrones-diseno.md` (patrones dirigidos por dominio y puertos)  
- `stack-tecnologico.md` (TypeScript, NestJS, Drizzle, Zod, pnpm, Next/React)

---

## 1. Contexto del problema

Los restaurantes procesan órdenes desde múltiples canales (mesas en sala, pedidos para llevar, aplicaciones de delivery) que suelen cambiar de proveedor o de tecnología externa.

Si las reglas de cobro, descuentos o preparación quedan atadas a un framework web o a una base de datos concreta, cualquier cambio de infraestructura rompe el negocio.

El sistema necesita:

- Aislar las reglas de venta en un núcleo estable.
- Conectar adaptadores de entrada (web, consola, delivery) y de salida (persistencia, cobros) sin alterar ese núcleo.
- Cumplir los requisitos funcionales RF1–RF5 sin acoplar el dominio a la infraestructura.

---

## 2. Decisión arquitectónica

**Se adoptará Arquitectura Hexagonal (Ports & Adapters) como marco principal del proyecto.**

El núcleo contendrá entidades y casos de uso. La infraestructura se conectará mediante puertos (contratos) e implementaciones (adaptadores).

Clean Architecture no se descarta: se usará como forma de organizar el interior del hexágono (entidades → casos de uso), pero la arquitectura que define el sistema frente al exterior es Hexagonal.

---

## 3. Por qué Hexagonal es la más adecuada

El problema descrito en la documentación inicial no es solo “ordenar capas”, sino **conectar y desconectar canales externos** sin tocar las reglas de venta.

Eso coincide con el modelo de puertos y adaptadores:

| Tipo | Rol | Ejemplos en este proyecto |
|------|-----|---------------------------|
| Adaptadores de entrada (driving) | Disparan casos de uso | API web, consola, integración delivery, POS de mesa |
| Núcleo (dominio + aplicación) | Reglas de negocio | Menú, orden, estado de cocina, cálculo, cierre |
| Adaptadores de salida (driven) | Efectos externos | Base de datos, cobro en efectivo/tarjeta/pasarela |

Ventajas concretas para este sistema:

1. **Independencia de canales:** mesas, para llevar y delivery pueden cambiar de proveedor sin reescribir RF3–RF4.
2. **Independencia de cobro:** RF5 se resuelve con varios adaptadores detrás del mismo puerto de pago.
3. **Cálculo determinista protegido:** subtotales, propinas, descuentos e impuestos viven en el núcleo (RF4).
4. **Reglas de cocina protegidas:** la no editabilidad tras iniciar cocción (RF3) no depende del framework ni de la BD.
5. **Lenguaje alineado a la documentación:** la descripción inicial ya habla de adaptadores web, consola y bases de datos.

---

## 4. Relación con Clean Architecture

Hexagonal y Clean Architecture **no son rivales**. Clean Architecture refina y detalla ideas de Hexagonal:

- Entidades
- Casos de uso
- Adaptadores de interfaz
- Frameworks e infraestructura

Para este proyecto:

- **Hexagonal** comunica mejor el diseño frente a canales e infraestructura variables.
- **Clean** aporta estructura interna clara al núcleo.

En la documentación del proyecto se puede formular así:

> Hexagonal (puertos y adaptadores), con núcleo organizado al estilo Clean Architecture.

---

## 5. Encaje con los requisitos funcionales

| Requisito | Encaje con Hexagonal |
|-----------|----------------------|
| **RF1** — Administrar menú (platos, modificadores, precios, impuestos) | Entidades y casos de uso en el núcleo; persistencia vía puerto de repositorio. |
| **RF2** — Abrir comanda vinculada a mesa o ID externo | Adaptadores de canal distintos (sala / externo) hacia el mismo caso de uso `AbrirOrden`. |
| **RF3** — Agregar, modificar o cancelar líneas según estado de cocina | Regla de dominio en el núcleo; no editable tras iniciar cocción, independiente del canal. |
| **RF4** — Calcular subtotales, propinas, descuentos e impuestos | Servicio/caso de uso de cálculo determinista en el núcleo. |
| **RF5** — Cierre de orden y pago multiadaptador | Puerto de cobro + adaptadores: efectivo, tarjeta, pasarela digital. |

---

## 6. Enfoque práctico adoptado

1. **Marco principal:** Arquitectura Hexagonal.
2. **Interior del hexágono:** entidades (`Orden`, `Plato`, `LineaPedido`, `Pago`, etc.) y casos de uso (`AbrirOrden`, `AgregarLinea`, `CalcularTotales`, `CerrarOrden`, …).
3. **Exterior:** adaptadores de entrada (API, consola, delivery) y de salida (repositorios, pasarelas de pago).
4. **Regla de dependencia:** el núcleo no conoce frameworks, HTTP, SQL ni SDKs de cobro; solo puertos.

---

## 7. Conclusión

Se trabajará con **Arquitectura Hexagonal** porque el dolor principal del sistema es la variabilidad de canales e infraestructura, no solo la separación interna de capas.

Clean Architecture se usa como guía para estructurar el núcleo, no como arquitectura alternativa.

Con esto, los requisitos RF1–RF5 pueden implementarse de forma estable, testeable y desacoplada de proveedores externos.

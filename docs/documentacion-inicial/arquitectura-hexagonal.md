# Arquitectura Hexagonal (Ports & Adapters)
## Guía normativa — Sistema de Pedidos de Restaurante

**Estado:** documento canónico de diseño interno.  
**Obligatorio** para cualquier implementación en este repo.  
**Origen del patrón:** Alistair Cockburn — *Hexagonal Architecture / Ports & Adapters*.  
**Complementa:** `analisis-arquitectura.md`, `propuesta-inicial.md`, `limites-capas.mdc`.

---

## 1. Qué es (definición operativa)

La arquitectura hexagonal exige construir la aplicación de modo que:

1. **Funcione sin UI y sin base de datos** (pruebas contra el núcleo con fakes/mocks).  
2. Se puedan **cambiar tecnologías** conectadas (web, consola, Postgres, pasarela) sin reescribir reglas de venta.  
3. No haya **fugas** entre lógica de negocio y frameworks/infraestructura.  
4. El núcleo **no nombre** tecnologías externas: solo habla por **puertos** (interfaces en lenguaje de dominio).

Sinónimo oficial del patrón: **Ports & Adapters**.

> Regla fuerte (Cockburn): *“The app cannot know anything about the external technology.”*  
> El puerto driven no se expresa en SQL ni en HTTP; se expresa en conceptos del dominio (`Order`, `Money`, `save(order)`).

---

## 2. Piezas del hexágono

```text
                 DRIVING (izquierda / primary)
            ┌──────────────────────────────────┐
   Next.js  │                                  │
   REST     │         PUERTOS DRIVING          │
   Tests    │    (casos de uso / API del app)  │
   Consola  │                                  │
            │         ╔══════════════╗         │
            │         ║   APLICACIÓN ║         │
            │         ║   + DOMINIO  ║         │
            │         ╚══════════════╝         │
            │                                  │
            │         PUERTOS DRIVEN           │
   Postgres │    (interfaces que el app exige) │  Efectivo /
   Drizzle  │                                  │  Tarjeta /
   Fakes    │                                  │  Pasarela
            └──────────────────────────────────┘
                 DRIVEN (derecha / secondary)
```

| Concepto | Qué es | Quién lo posee |
|----------|--------|----------------|
| **Dominio** | Entidades, agregados, VOs, reglas (`Orden` no editable en cocción, cálculo de totales) | Núcleo |
| **Aplicación** | Casos de uso que orquestan dominio + puertos | Núcleo |
| **Puerto driving (primary)** | API que el exterior **llama** para usar el app (`AbrirOrden`, `CerrarOrden`) | Núcleo (interfaz “ofrecida”) |
| **Puerto driven (secondary)** | API que el app **necesita** del exterior (`OrdenRepository`, `PaymentPort`) | Núcleo (interfaz “requerida”) |
| **Adaptador driving** | Traduce HTTP/UI/CLI → llama al puerto driving | Fuera del núcleo |
| **Adaptador driven** | Implementa el puerto driven (Drizzle, cobro fake, etc.) | Fuera del núcleo |
| **Composition root** | Cablea adaptadores concretos a los puertos (DI Nest) | Arranque / módulos Nest |

Los adaptadores son **intercambiables** detrás del mismo puerto. El hexágono no cambia.

---

## 3. Asimetría izquierda / derecha (imprescindible)

| Lado | Actor | Quién inicia | Puerto | Adaptador |
|------|-------|--------------|--------|-----------|
| **Driving** | Primary (usuario, test, delivery) | El exterior **empuja** al app | El adaptador **usa** la interfaz del caso de uso | Controller Nest, página Next, test |
| **Driven** | Secondary (BD, cobro) | El app **empuja** al exterior | El adaptador **implementa** la interfaz del puerto | `DrizzleOrdenRepository`, `EfectivoPaymentAdapter` |

Confusión típica a evitar:

- Un controller Nest **no es** el dominio: es adaptador driving.  
- Un repositorio Drizzle **no es** un caso de uso: es adaptador driven.  
- La interfaz `OrdenRepository` **sí es** del núcleo (puerto), aunque la clase Drizzle viva en infraestructura.

---

## 4. Regla de dependencias (ley del proyecto)

```text
Adaptadores ──► Aplicación ──► Dominio
     │                │
     │                └──► Puertos (interfaces)
     │
     └── implementan puertos driven / llaman puertos driving
```

**Prohibido:**

- Dominio importa Nest, Next, Drizzle, `pg`, Zod de HTTP, SDKs de pago.  
- Caso de uso instancia `new Drizzle…` o lee `process.env` de infra.  
- UI calcula impuestos/totales/reglas de cocina como fuente de verdad.  
- Mapper de BD importa componentes React o DTOs de pantalla.

**Permitido:**

- Dominio puro TypeScript.  
- Aplicación depende de abstracciones (puertos).  
- Infraestructura importa dominio solo para mapear hacia/desde modelos de producto.  
- Interface HTTP valida con Zod y llama casos de uso.

---

## 5. Cómo se construye (orden recomendado)

Secuencia alineada con Ports & Adapters y con las fases del proyecto:

### Paso A — Dominio primero

1. Modelar `Order`, `LineItem`, `MenuItem`, `Money`, estados.  
2. Codificar reglas (RF3, RF4) **sin** Nest ni BD.  
3. Tests unitarios del agregado (edición bloqueada en cocción, totales deterministas).

### Paso B — Puertos y casos de uso

1. Definir puertos driven en lenguaje de dominio, p. ej.:

```typescript
// application/ports/order-repository.port.ts  (pertenece al núcleo)
export interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>;
}

export interface PaymentPort {
  charge(input: ChargePayment): Promise<PaymentResult>;
}
```

2. Definir casos de uso que reciben puertos por constructor (DI):

```typescript
export class CloseOrder {
  constructor(
    private readonly orders: OrderRepository,
    private readonly payments: PaymentPort,
  ) {}

  async execute(command: CloseOrderCommand): Promise<OrderTotals> {
    const order = await this.orders.findById(command.orderId);
    // reglas de dominio + payments.charge(...) + orders.save(...)
  }
}
```

3. Tests del caso de uso con **fakes en memoria** (adaptadores driven de test).

### Paso C — Adaptadores driven

1. `DrizzleOrderRepository` implementa `OrderRepository`.  
2. `CashPaymentAdapter` / `CardPaymentAdapter` / `DigitalGatewayFakeAdapter` implementan `PaymentPort`.  
3. Mapear filas SQL → modelos de producto **aquí**, no en el dominio ni en la UI.

### Paso D — Adaptadores driving

1. Controller Nest: Zod → command → `CloseOrder.execute` → JSON de producto.  
2. Next.js: llama REST; muestra lo que devolvió el núcleo.  
3. Tests e2e opcionales; el núcleo ya está cubierto sin UI.

### Paso E — Composition root

En Nest: providers que enlazan interfaz (token/puerto) → clase adaptador.  
Eso es el **configurador**: el único lugar que “conoce” qué tecnología concreta se usa.

---

## 6. Estructura de carpetas obligatoria (`apps/api`)

```text
apps/api/src/
  domain/                 # HEXÁGONO — reglas puras
    order/
    menu/
    money/
  application/            # HEXÁGONO — casos de uso + puertos
    ports/                # interfaces driven (y driving si se separan)
    use-cases/
  infrastructure/         # ADAPTADORES DRIVEN
    persistence/drizzle/
    payment/
  interface/              # ADAPTADORES DRIVING
    http/
      dto/                # Zod en el borde
      controllers/
  main.ts / app.module.ts # composition root (Nest)
```

Nombres de carpeta pueden variar levemente, **no** la dirección de dependencias.

Dentro del monolito modular, se puede subdividir por feature (`menu/`, `order/`, `payment/`) **respetando** domain / application / infrastructure / interface.

---

## 7. Naming de puertos

| Bien (propósito / dominio) | Mal (tecnología) |
|----------------------------|------------------|
| `OrderRepository` | `PostgresOrderDao` como puerto del núcleo |
| `PaymentPort` / `ForChargingPayment` | `StripePort` dentro del dominio |
| `CloseOrder` | `OrderControllerService` mezclando HTTP |

Los adaptadores sí pueden llamarse `DrizzleOrderRepository` o `StripePaymentAdapter`: viven **fuera** del hexágono.

---

## 8. Mapa a este restaurante (RF1–RF5)

| RF | En el hexágono | Adaptadores |
|----|----------------|-------------|
| RF1 Menú | Entidades menú + use cases CRUD | Drizzle + UI admin |
| RF2 Abrir orden | `OpenOrder` + origen mesa/externo | HTTP / Next |
| RF3 Líneas + cocina | Reglas en agregado `Order` + State | Mismo; UI solo refleja |
| RF4 Totales | Cálculo + Money + Strategy descuento/impuesto | Ninguno “de framework” |
| RF5 Cobro | `CloseOrder` + `PaymentPort` | Strategies/adapters de cobro |

---

## 9. Relación con Clean Architecture

En este proyecto:

- **Hexagonal** define el borde: puertos y adaptadores.  
- **Clean** organiza el interior: entidades → casos de uso.

No son arquitecturas rivales. Formulación oficial del repo:

> Hexagonal (Ports & Adapters), con núcleo organizado al estilo Clean Architecture.

---

## 10. Checklist antes de merge / “listo”

- [ ] ¿El cambio de dominio/aplicación compila **sin** imports de Nest/Next/Drizzle/HTTP?  
- [ ] ¿Existe un puerto (interfaz) para cada dependencia externa nueva?  
- [ ] ¿El adaptador implementa el puerto y no al revés?  
- [ ] ¿Se puede testear el caso de uso con un fake, sin Postgres ni browser?  
- [ ] ¿La API/UI habla vocabulario de producto, no de tablas?  
- [ ] ¿RF3/RF4 siguen en el dominio, no en el controller ni en React?  
- [ ] ¿El composition root (Nest module) es quien cablea el adaptador concreto?

Si alguna falla → **no es hexagonal**; corregir antes de continuar.

---

## 11. Anti-patrones (rechazar)

| Anti-patrón | Por qué rompe el hexágono |
|-------------|---------------------------|
| “Service” Nest con SQL y reglas de cocina juntos | Mezcla adaptador + dominio |
| Puerto con métodos `query(sql: string)` | Fuga de tecnología (implementación débil) |
| Calcular IVA en React como verdad | Driving adapter usurpa el núcleo |
| `Order` entity decorada con TypeORM/Drizzle schema | Dominio acoplado a persistencia |
| Nuevo medio de pago = ifs en el caso de uso | Debe ser nuevo adaptador/Strategy detrás del puerto |
| Saltar al controller “porque es más rápido” sin puerto | Impide tests sin UI/BD |

---

## 12. Lectura obligatoria para el agente Cursor

Al implementar código bajo `apps/api`, `domain`, `application` o adaptadores:

1. Aplicar esta guía + `.cursor/rules/arquitectura-hexagonal.mdc`.  
2. Respetar `.cursor/rules/limites-capas.mdc`.  
3. En el chat, si el cambio toca capas: indicar brevemente **qué va en dominio / application / adapter**.

Este archivo es la **fuente de verdad** de cómo se construye hexagonal en el Sistema de Pedidos de Restaurante.

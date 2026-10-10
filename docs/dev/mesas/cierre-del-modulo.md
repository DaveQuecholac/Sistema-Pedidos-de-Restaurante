# Las mesas del salón ya están en el sistema

Ampliación Gen 1 sobre RF2. El local tiene un catálogo real de mesas: se ven en el piso, se pueden agregar o quitar, y cada mesa admite solo una comanda abierta a la vez.

Fecha: 10 de octubre de 2026.

Pantallas:

- https://restaurante.localhost/ — piso de servicio (solo mesas activas; libre / ocupada según la comanda)
- https://restaurante.localhost/mesas/admin — administrar mesas

Desde el Home: «Administrar mesas». Desde el admin: «Volver al piso».

## Qué puede hacer el local

**Piso (mesero)**

- Ver las mesas que están activas (las del seed y las que se hayan sumado).
- Elegir una mesa y abrir comanda, o entrar a la que ya tiene.
- Ver si está libre, con orden en curso o lista para cobro (según el estado de la comanda).

**Administración**

- Crear una mesa con número/id, etiqueta y zona (por defecto Salón).
- Editar etiqueta y zona.
- Desactivar una mesa libre: deja de aparecer en el piso; no se borra del historial.
- Volver a activarla cuando haga falta.
- Si la mesa tiene comanda abierta, no se puede desactivar: el sistema lo dice en claro.

## Reglas que ya aplican

1. Solo se abre comanda en una mesa que exista y esté activa.  
2. Una mesa = una comanda activa. Cerrar o cancelar libera la mesa.  
3. Pedido externo (id de canal) sigue igual; no usa el catálogo de mesas.  
4. Ocupada / libre se deduce de las órdenes; no hay un interruptor «ocupada» aparte.

## Demo corta

1. En el piso, abrir comanda en la mesa `1`, armar platos, cocina → lista → cobrar → la mesa vuelve a libre.  
2. En admin, crear mesa `8` → aparece en el piso.  
3. Desactivar la `8` libre → desaparece del piso. Activarla → vuelve.  
4. Con una comanda abierta en la `1`, intentar desactivarla → mensaje de error; la mesa sigue.  
5. «Nueva orden» con id externo sigue funcionando.

## Seed de partida

Al arrancar el entorno quedan seis mesas (`1`…`6`, zona Salón), si aún no estaban. Después el local decide cuántas más.

## Qué todavía no hace

No hay plano gráfico del salón, juntar o transferir mesas, ni reservas. No se borran mesas con historial a la fuerza (solo desactivar). Login y roles siguen fuera de Gen 1.

## Relación con otros módulos

- Comanda / cocina: la regla «una activa por mesa» actualiza lo acordado el 4 de octubre; ver `docs/dev/comanda/01-orden-y-cocina/`.  
- Totales y cobro: sin cambios; cuando la orden está lista, el flujo de cuenta sigue igual.

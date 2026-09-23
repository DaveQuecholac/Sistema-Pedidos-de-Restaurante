Sistema de Pedidos de Restaurante (Clean Architecture / Hexagonal)
* Descripción y problema a resolver: Los restaurantes procesan órdenes desde 
múltiples canales (mesas en sala, pedidos para llevar, aplicaciones delivery) que a 
menudo cambian de proveedor o tecnología externa. Si las reglas de cobro, 
descuentos o preparación están atadas a un framework web o base de datos 
específica, cualquier cambio de infraestructura rompe el negocio. La arquitectura 
hexagonal aísla los casos de uso y entidades en el núcleo, permitiendo conectar 
adaptadores web, de consola o bases de datos sin alterar las reglas de venta.
* Requisitos funcionales:
o RF1: Administrar el menú con platos, modificadores (ingredientes 
extra/exclusiones), precios e impuestos aplicables.
o RF2: Abrir una comanda/orden vinculada a una mesa física o a un 
identificador de pedido externo.
o RF3: Agregar, modificar o cancelar líneas de pedido validando el estado actual e p
de la cocina (no editable tras iniciar cocción).
o RF4: Calcular subtotales, propinas opcionales, descuentos promocionales e 
impuestos de forma determinista.
o RF5: Procesar el cierre de la orden y registrar el pago a través de múltiples 
adaptadores de cobro (efectivo, tarjeta, pasarela digital).

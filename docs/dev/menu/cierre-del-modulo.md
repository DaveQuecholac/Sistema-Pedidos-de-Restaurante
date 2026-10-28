# El menú ya se puede armar

Primer módulo del sistema de pedidos. Sirve para dejar lista la carta del restaurante antes de tomar la orden de una mesa.

Fecha: 30 de septiembre de 2026.

La pantalla está en https://restaurante.localhost/menu. Desde el inicio se entra con «Administrar menú».

## Qué puede hacer el local

Quien arma la carta puede:

- Ver los platos de tres en tres, dentro de un marco, para mirar varios a la vez.
- Crear un plato con nombre, precio e impuesto.
- Anotar los ingredientes que ese plato ya trae. Por ejemplo, los tacos traen tortilla, suadero, cilantro y cebolla.
- Ofrecer un extra: algo que el plato no trae de base y sí se cobra. Queso, nuez, chía.
- Decir qué se puede quitar. Eso no se escribe a mano: se elige entre los ingredientes que el plato ya tiene. Quitar cilantro no cuesta. Un extra sí.
- Corregir un plato cuando cambie el precio, un ingrediente o un extra.
- Retirar un plato de la venta sin borrarlo. Se ve distinto y se puede volver a activar.

El precio se escribe en pesos. El impuesto se escribe en porcentaje. El sistema los guarda exactos, para que más adelante la cuenta no dependa de un redondeo.

## Los cinco platos de muestra

| Plato | Precio | Trae | Se puede agregar | Se puede quitar |
|-------|--------|------|------------------|-----------------|
| Tacos de suadero | $45.00 | Tortilla, suadero, cilantro, cebolla | Queso, $15.00 | Cilantro, cebolla |
| Quesadilla de flor | $42.00 | Tortilla, queso, flor de calabaza, epazote | Champiñón, $12.00 | Epazote |
| Consomé de pollo | $55.00 | Caldo, pollo, garbanzo, arroz, aguacate | Pieza extra, $20.00 | Aguacate |
| Agua de jamaica | $25.00 | Jamaica, agua, azúcar | Chía, $5.00 | Azúcar |
| Flan | $35.00 | Huevo, leche, caramelo, vainilla | Nuez, $10.00 | Vainilla |

Son datos de prueba. Se pueden editar o sustituir por la carta real.

## Cómo se usa la pantalla

A la izquierda está la carta. A la derecha, la ficha del plato: nombre, precio e impuesto.

«Ingredientes» y «Modificadores» aparecen cerrados, con cuántos hay. Se abren solo cuando hace falta verlos o cambiarlos, para que una receta larga no empuje toda la página hacia abajo.

## Qué todavía no hace

Este módulo no toma la orden, no avisa a cocina y no cobra.

Cuando alguien pida en la mesa, el plato ya sabrá qué trae, qué extra se puede cobrar y qué ingrediente se puede omitir. Esa elección, la de la comanda, es el siguiente módulo.

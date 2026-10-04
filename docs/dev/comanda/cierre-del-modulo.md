# La comanda ya llega a cocina

Segundo módulo del sistema de pedidos. Sirve para abrir una orden (mesa o pedido externo), armarla con la carta, mandarla a cocina y marcarla lista, sin poder editar ni cancelar cuando ya está en cocción.

Fecha: 4 de octubre de 2026.

Pantallas:

- https://restaurante.localhost/orders — lista y abrir comanda  
- https://restaurante.localhost/orders/{id} — detalle y líneas  
- https://restaurante.localhost/kitchen — pendientes, en cocción y listas  

Desde el inicio: «Comandas» y «Cocina», junto a «Administrar menú».

## Qué puede hacer el local

**Mesero (comandas)**

- Abrir una comanda por mesa o por id de pedido externo.
- Agregar, editar o quitar platos mientras la orden está abierta.
- Elegir extras y omisiones que vienen de la carta.
- Enviar a cocina. Ahí ya no se editan líneas; todavía se puede cancelar la orden.
- Ver el aviso cuando la cocina ya puso el pedido en cocción (ya no se cancela).
- Cancelar con confirmación en pantalla (no con el diálogo del navegador).

**Cocina**

- Ver pedidos pendientes (llegaron y aún no se cocinan).
- «Poner en cocción».
- «Marcar lista» solo cuando ya están en cocción.
- Actualizar la lista a mano.

## Cómo fluye una orden

```text
Abierta → En cocina (pendiente) → En cocción → Lista
```

1. Se abre la comanda y se arman las líneas.  
2. «Enviar a cocina»: entra a pendientes de cocina.  
3. Cocina pulsa «Poner en cocción»: el mesero ya no puede cancelar.  
4. Cocina pulsa «Marcar lista».  

No se calcula la cuenta en esta pantalla. Totales y cobro van en sprints siguientes.

## Demo corta

1. En Comandas, abrir mesa `D2-1`.  
2. Agregar tacos con queso y sin cilantro; agregar agua.  
3. Enviar a cocina.  
4. En Cocina: «Poner en cocción» y luego «Marcar lista».  
5. En el detalle, la orden queda «Lista».

## Qué todavía no hace

No desglosa subtotal, propina, descuentos ni impuestos. No cobra ni cierra la cuenta. No hay login ni impresión de ticket.

## Deuda

El estilo de comandas y cocina se copió del menú. Queda unificar cuando se haga la UI final.

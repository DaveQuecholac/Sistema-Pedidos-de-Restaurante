const id = [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }];

export const ordersOpenApi = {
  openapi: '3.0.3',
  info: {
    title: 'Órdenes',
    version: '1.0.0',
    description:
      'Comanda, cocina, totales y cuenta de mesa. El cobro lo ejecuta Pagos por gRPC; este servicio expone el cierre. ' +
      'El navegador entra por el gateway con JWT. Pagos se documenta en apps/payments/openapi.yaml.',
  },
  tags: [{ name: 'Order' }, { name: 'Totals' }, { name: 'Payment' }, { name: 'TableAccount' }],
  paths: {
    '/health': { get: { tags: ['Order'], summary: 'Proceso vivo', responses: { '200': { description: 'ok' } } } },
    '/orders': {
      get: { tags: ['Order'], summary: 'Lista comandas', responses: { '200': { description: 'Order[]' } } },
      post: { tags: ['Order'], summary: 'Abre comanda (mesa o ID externo)', responses: { '201': { description: 'Order' } } },
    },
    '/orders/{orderId}': {
      get: { tags: ['Order'], summary: 'Una comanda', parameters: id, responses: { '200': { description: 'Order' } } },
    },
    '/orders/{orderId}/lines': {
      post: { tags: ['Order'], summary: 'Agrega una línea', parameters: id, responses: { '201': { description: 'Order' } } },
    },
    '/orders/{orderId}/lines/{lineId}': {
      patch: { tags: ['Order'], summary: 'Modifica una línea', parameters: id, responses: { '200': { description: 'Order' } } },
      delete: { tags: ['Order'], summary: 'Cancela una línea', parameters: id, responses: { '200': { description: 'Order' } } },
    },
    '/orders/{orderId}/send-to-kitchen': {
      post: { tags: ['Order'], summary: 'Envía a cocina', parameters: id, responses: { '200': { description: 'Order' } } },
    },
    '/orders/{orderId}/begin-cooking': {
      post: { tags: ['Order'], summary: 'Inicia cocción. Desde aquí la comanda no se edita.', parameters: id, responses: { '200': { description: 'Order' } } },
    },
    '/orders/{orderId}/mark-ready': {
      post: { tags: ['Order'], summary: 'Marca lista', parameters: id, responses: { '200': { description: 'Order' } } },
    },
    '/orders/{orderId}/cancel': {
      post: { tags: ['Order'], summary: 'Cancela la comanda si la cocina aún no empezó', parameters: id, responses: { '200': { description: 'Order' } } },
    },
    '/orders/{orderId}/totals': {
      get: { tags: ['Totals'], summary: 'Subtotal, descuento, propina, impuesto y total', parameters: id, responses: { '200': { description: 'Totals' } } },
    },
    '/orders/{orderId}/discount': {
      put: { tags: ['Totals'], summary: 'Fija el descuento', parameters: id, responses: { '200': { description: 'Totals' } } },
    },
    '/orders/{orderId}/tip': {
      put: { tags: ['Totals'], summary: 'Fija la propina', parameters: id, responses: { '200': { description: 'Totals' } } },
    },
    '/orders/{orderId}/close': {
      post: { tags: ['Payment'], summary: 'Cierra y cobra vía Pagos', parameters: id, responses: { '200': { description: 'Order' } } },
    },
    '/orders/{orderId}/payment': {
      get: { tags: ['Payment'], summary: 'Cobro registrado', parameters: id, responses: { '200': { description: 'Payment' } } },
    },
    '/tables/{tableId}/account': {
      get: { tags: ['TableAccount'], summary: 'Cuenta de la mesa', responses: { '200': { description: 'TableAccount' } } },
    },
    '/tables/{tableId}/account/billing-mode': {
      put: { tags: ['TableAccount'], summary: 'Modo combined o separate', responses: { '200': { description: 'TableAccount' } } },
    },
    '/tables/{tableId}/account/discount': {
      put: { tags: ['TableAccount'], summary: 'Descuento de la cuenta', responses: { '200': { description: 'TableAccount' } } },
    },
    '/tables/{tableId}/account/tip': {
      put: { tags: ['TableAccount'], summary: 'Propina de la cuenta', responses: { '200': { description: 'TableAccount' } } },
    },
    '/tables/{tableId}/account/close': {
      post: { tags: ['TableAccount'], summary: 'Cierra la cuenta y cobra', responses: { '200': { description: 'TableAccount' } } },
    },
  },
};

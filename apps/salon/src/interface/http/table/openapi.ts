export const salonOpenApi = {
  openapi: '3.0.3',
  info: {
    title: 'Salón',
    version: '1.0.0',
    description: 'Catálogo de mesas. La ocupación no se guarda aquí: al desactivar, Salón pregunta a Órdenes si hay comanda activa.',
  },
  tags: [{ name: 'Table' }],
  paths: {
    '/tables': {
      get: {
        tags: ['Table'],
        summary: 'Lista las mesas',
        responses: { '200': { description: 'Table[]' } },
      },
      post: {
        tags: ['Table'],
        summary: 'Alta de mesa',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TableWrite' } } },
        },
        responses: { '201': { description: 'Table' } },
      },
    },
    '/tables/{tableId}': {
      get: {
        tags: ['Table'],
        summary: 'Una mesa',
        parameters: [{ name: 'tableId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Table' } },
      },
      patch: {
        tags: ['Table'],
        summary: 'Cambia etiqueta o zona',
        parameters: [{ name: 'tableId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Table' } },
      },
    },
    '/tables/{tableId}/deactivate': {
      post: {
        tags: ['Table'],
        summary: 'Baja. Rechaza si Órdenes tiene una comanda activa.',
        parameters: [{ name: 'tableId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Table' } },
      },
    },
    '/tables/{tableId}/activate': {
      post: {
        tags: ['Table'],
        summary: 'Reactiva la mesa',
        parameters: [{ name: 'tableId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Table' } },
      },
    },
  },
  components: {
    schemas: {
      TableWrite: {
        type: 'object',
        required: ['label', 'zone'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          zone: { type: 'string' },
        },
      },
      Table: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          zone: { type: 'string' },
          active: { type: 'boolean' },
        },
      },
    },
  },
};

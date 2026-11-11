export const menuOpenApi = {
  openapi: '3.0.3',
  info: {
    title: 'Menú',
    version: '1.0.0',
    description:
      'Catálogo de platos, ingredientes y modificadores. ' +
      'GET /menu-items usa cache-aside: si Redis no tiene menu:items, lee Postgres y guarda el listado con TTL MENU_CACHE_TTL_SECONDS (60 por defecto). ' +
      'Un alta, cambio o baja borra esa clave.',
  },
  tags: [{ name: 'MenuItem' }],
  paths: {
    '/menu-items': {
      get: {
        tags: ['MenuItem'],
        summary: 'Lista los platos. Puede salir de caché.',
        responses: { '200': { description: 'MenuItem[]' } },
      },
      post: {
        tags: ['MenuItem'],
        summary: 'Crea un plato e invalida la caché.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MenuItemWrite' } } },
        },
        responses: { '201': { description: 'MenuItem' } },
      },
    },
    '/menu-items/{id}': {
      patch: {
        tags: ['MenuItem'],
        summary: 'Reemplaza el plato e invalida la caché.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MenuItemUpdate' } } },
        },
        responses: { '200': { description: 'MenuItem' } },
      },
    },
    '/menu-items/{id}/deactivate': {
      post: {
        tags: ['MenuItem'],
        summary: 'Da de baja el plato e invalida la caché.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'MenuItem' } },
      },
    },
  },
  components: {
    schemas: {
      Money: {
        type: 'object',
        required: ['amount', 'currency'],
        properties: {
          amount: { type: 'integer' },
          currency: { type: 'string', example: 'MXN' },
        },
      },
      MenuItemWrite: {
        type: 'object',
        required: ['name', 'price', 'applicableTax', 'ingredients', 'modifiers'],
        properties: {
          name: { type: 'string' },
          price: { $ref: '#/components/schemas/Money' },
          applicableTax: {
            type: 'object',
            properties: { basisPoints: { type: 'integer', example: 1600 } },
          },
          ingredients: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } },
          modifiers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                kind: { type: 'string', enum: ['extra', 'exclusion'] },
                price: { $ref: '#/components/schemas/Money' },
              },
            },
          },
        },
      },
      MenuItemUpdate: {
        allOf: [
          { $ref: '#/components/schemas/MenuItemWrite' },
          { type: 'object', required: ['active'], properties: { active: { type: 'boolean' } } },
        ],
      },
    },
  },
};

/** Public contract of the gateway: login, TTL, and where each path goes. */
export const gatewayOpenApi = {
  openapi: '3.0.3',
  info: {
    title: 'Gateway',
    version: '1.0.0',
    description:
      'Única puerta HTTP. Emite el JWT del personal y lo valida antes de enrutar. ' +
      'TTL por defecto 2h (JWT_EXPIRES_IN). Menú, Salón y Órdenes documentan sus recursos en /docs de cada servicio. ' +
      'Pagos no tiene HTTP: su contrato OpenAPI está en apps/payments/openapi.yaml (gRPC Charge, Void, GetReceipt).',
  },
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Emite un JWT de área con exp',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['role'],
                properties: {
                  role: { type: 'string', enum: ['waiter', 'cashier', 'kitchen'] },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Token Bearer',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    accessToken: { type: 'string' },
                    tokenType: { type: 'string', example: 'Bearer' },
                    expiresIn: { type: 'integer', description: 'Segundos hasta exp', example: 7200 },
                    role: { type: 'string' },
                  },
                },
              },
            },
          },
          '400': { description: 'Rol ausente o desconocido' },
        },
      },
    },
    '/health': {
      get: {
        tags: ['Auth'],
        summary: 'Proceso vivo. No pide JWT.',
        responses: { '200': { description: 'ok' } },
      },
    },
    '/menu-items': {
      get: {
        tags: ['Enrutado'],
        summary: 'Reenvía a Menú. Exige Authorization Bearer.',
        responses: { '200': { description: 'Respuesta de Menú' }, '401': { description: 'JWT ausente, inválido o vencido' } },
      },
    },
    '/tables': {
      get: {
        tags: ['Enrutado'],
        summary: 'Reenvía a Salón. La cuenta /tables/{id}/account va a Órdenes. Exige Bearer.',
        responses: { '200': { description: 'Respuesta de Salón' }, '401': { description: 'JWT ausente, inválido o vencido' } },
      },
    },
    '/orders': {
      get: {
        tags: ['Enrutado'],
        summary: 'Reenvía a Órdenes. Exige Bearer.',
        responses: { '200': { description: 'Respuesta de Órdenes' }, '401': { description: 'JWT ausente, inválido o vencido' } },
      },
    },
  },
};

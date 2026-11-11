import type { INestApplication } from '@nestjs/common';
import type { Express, Request, Response } from 'express';

const DOCS_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger' });
  </script>
</body>
</html>
`;

/** Serves the OpenAPI document and Swagger UI. Neither route is a business operation. */
export function serveOpenApi(app: INestApplication, document: unknown): void {
  const server = app.getHttpAdapter().getInstance() as Express;
  server.get('/openapi.json', (_req: Request, res: Response) => {
    res.json(document);
  });
  server.get('/docs', (_req: Request, res: Response) => {
    res.type('html').send(DOCS_HTML);
  });
}

import express, { Application } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

export function crearApp(): Application {
  const app = express();

  const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
  const TICKETS_URL = process.env.TICKETS_SERVICE_URL || 'http://localhost:8001';
  const COMENTARIOS_URL = process.env.COMENTARIOS_SERVICE_URL || 'http://localhost:3002';
  const NOTIFICACIONES_URL = process.env.NOTIFICACIONES_SERVICE_URL || 'http://localhost:8002';

  app.use(
    '/api/auth',
    createProxyMiddleware({ target: AUTH_URL, changeOrigin: true, pathRewrite: { '^/api/auth': '/api/auth' } })
  );
  app.use('/graphql/auth', createProxyMiddleware({ target: AUTH_URL, changeOrigin: true, pathRewrite: { '^/graphql/auth': '/graphql' } }));

  app.use(
    '/api/tickets',
    createProxyMiddleware({ target: TICKETS_URL, changeOrigin: true, pathRewrite: { '^/api/tickets': '/tickets' } })
  );
  app.use('/graphql/tickets', createProxyMiddleware({ target: TICKETS_URL, changeOrigin: true, pathRewrite: { '^/graphql/tickets': '/graphql' } }));

  app.use(
    '/api/comentarios',
    createProxyMiddleware({ target: COMENTARIOS_URL, changeOrigin: true, pathRewrite: { '^/api/comentarios': '/comentarios' } })
  );

  app.use(
    '/api/notificaciones',
    createProxyMiddleware({ target: NOTIFICACIONES_URL, changeOrigin: true, pathRewrite: { '^/api/notificaciones': '/notificaciones' } })
  );

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', servicio: 'api-gateway' });
  });

  app.use((req, res) => {
    res.status(404).json({ error: `La ruta ${req.method} ${req.originalUrl} no existe en el Gateway.` });
  });

  return app;
}

import express, { Application } from 'express';
import cookieParser from 'cookie-parser';

import { Database } from './infrastructure/database/Database';
import { PostgresUsuarioRepository } from './infrastructure/repositories/PostgresUsuarioRepository';
import { AesCipher } from './infrastructure/security/AesCipher';

import { TokenService } from './application/services/TokenService';
import { AuthService } from './application/services/AuthService';

import { AuthController } from './presentation/controllers/AuthController';
import { crearAuthRouter } from './presentation/routes/auth.routes';
import { crearMiddlewareVerificarToken } from './presentation/middlewares/verificarToken';
import { crearHandlerGraphQL } from './presentation/graphql/schema';
import { errorHandler } from './presentation/middlewares/errorHandler';
import { notFoundRoute } from './presentation/middlewares/notFoundRoute';

export function crearApp(): Application {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  const pool = Database.getPool();
  const repositorio = new PostgresUsuarioRepository(pool);
  const cifrador = new AesCipher(process.env.AES_KEY_HEX || '');

  const tokenService = new TokenService(
    process.env.JWT_SECRET || 'clave-de-desarrollo-cambiar-en-produccion',
    Number(process.env.JWT_TTL_SEGUNDOS) || 900,
    Number(process.env.JWT_RENOVACION_GRACIA_SEGUNDOS) || 300
  );

  const authService = new AuthService(repositorio, cifrador, tokenService, process.env.CORREO_HASH_SECRET || '');
  const authController = new AuthController(authService, tokenService);
  const verificarToken = crearMiddlewareVerificarToken(tokenService);

  app.use('/api/auth', crearAuthRouter(authController, tokenService));

  // GraphQL: se aplica verificarToken antes para poblar req.usuario;
  // si no hay sesión, la query `me` simplemente devuelve el error
  // "No autenticado." en vez de rechazar la petición HTTP completa
  // (así se puede introspeccionar el schema sin estar logueado).
  app.use('/graphql', (req, res, next) => {
    if (!req.cookies?.access_token) return next();
    verificarToken(req, res, next);
  });
  app.all('/graphql', (req, res, next) => {
    (req as any).raw = req;
    next();
  }, crearHandlerGraphQL(authService));

  app.use(notFoundRoute);
  app.use(errorHandler);

  return app;
}

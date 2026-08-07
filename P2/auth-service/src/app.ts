import path from 'path';
import express, { Application } from 'express';
import cookieParser from 'cookie-parser';

import { Database } from './infrastructure/database/Database';
import { PostgresUsuarioRepository } from './infrastructure/repositories/PostgresUsuarioRepository';
import { AesCipher } from './infrastructure/security/AesCipher';
import { HttpAutorizacionClient } from './infrastructure/authorization/HttpAutorizacionClient';

import { TokenService } from './application/services/TokenService';
import { AuthService } from './application/services/AuthService';

import { AuthController } from './presentation/controllers/AuthController';
import { RecursosController } from './presentation/controllers/RecursosController';
import { crearAuthRouter } from './presentation/routes/auth.routes';
import { crearRecursosRouter } from './presentation/routes/recursos.routes';
import { errorHandler } from './presentation/middlewares/errorHandler';
import { notFoundRoute } from './presentation/middlewares/notFoundRoute';

export function crearApp(): Application {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // --- Composición de dependencias (DIP en la práctica) ---
  const pool = Database.getPool();
  const repositorio = new PostgresUsuarioRepository(pool);
  const cifrador = new AesCipher(process.env.AES_KEY_HEX || '');

  const tokenService = new TokenService(
    process.env.JWT_SECRET || 'clave-de-desarrollo-cambiar-en-produccion',
    Number(process.env.JWT_TTL_SEGUNDOS) || 60,
    Number(process.env.JWT_RENOVACION_GRACIA_SEGUNDOS) || 120
  );

  const autorizacionClient = new HttpAutorizacionClient(
    process.env.AUTHZ_SERVICE_URL || 'http://localhost:4000',
    Number(process.env.AUTHZ_MAX_RETRIES) || 3,
    Number(process.env.AUTHZ_BACKOFF_BASE_MS) || 300,
    Number(process.env.AUTHZ_TIMEOUT_MS) || 2000
  );

  const authService = new AuthService(repositorio, cifrador, tokenService, process.env.CORREO_HASH_SECRET || '');

  const authController = new AuthController(authService, tokenService);
  const recursosController = new RecursosController();

  app.use('/api/auth', crearAuthRouter(authController, tokenService));
  app.use('/api/recursos', crearRecursosRouter(recursosController, tokenService, autorizacionClient));

  app.use(notFoundRoute);
  app.use(errorHandler);

  return app;
}

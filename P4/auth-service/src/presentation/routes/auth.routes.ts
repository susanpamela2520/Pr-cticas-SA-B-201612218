import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { crearMiddlewareVerificarToken } from '../middlewares/verificarToken';
import { TokenService } from '../../application/services/TokenService';

export function crearAuthRouter(controller: AuthController, tokenService: TokenService): Router {
  const router = Router();
  const verificarToken = crearMiddlewareVerificarToken(tokenService);

  router.post('/registro', controller.registrar);
  router.post('/login', controller.login);
  router.post('/logout', controller.logout);
  router.get('/me', verificarToken, controller.perfil);

  return router;
}

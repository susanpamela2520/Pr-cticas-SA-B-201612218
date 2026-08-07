import { Router } from 'express';
import { RecursosController } from '../controllers/RecursosController';
import { crearMiddlewareVerificarToken } from '../middlewares/verificarToken';
import { crearMiddlewareAutorizar } from '../middlewares/autorizar';
import { TokenService } from '../../application/services/TokenService';
import { IAutorizacionClient } from '../../infrastructure/authorization/IAutorizacionClient';

export function crearRecursosRouter(
  controller: RecursosController,
  tokenService: TokenService,
  autorizacionClient: IAutorizacionClient
): Router {
  const router = Router();
  const verificarToken = crearMiddlewareVerificarToken(tokenService);

  router.get(
    '/ruta1',
    verificarToken,
    crearMiddlewareAutorizar(autorizacionClient, 'ruta1'),
    controller.ruta1Soloadmin
  );

  router.get(
    '/ruta2',
    verificarToken,
    crearMiddlewareAutorizar(autorizacionClient, 'ruta2'),
    controller.ruta2AdminYCliente
  );

  return router;
}

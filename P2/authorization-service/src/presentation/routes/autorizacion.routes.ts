import { Router } from 'express';
import { AutorizacionController } from '../controllers/AutorizacionController';

export function crearAutorizacionRouter(controller: AutorizacionController): Router {
  const router = Router();
  router.post('/authorize', controller.autorizar);
  return router;
}

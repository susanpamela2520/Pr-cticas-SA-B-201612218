import { Router } from 'express';
import { SolicitudController } from '../controllers/SolicitudController';

/**
 * SRP: este archivo solo mapea verbos HTTP + rutas a métodos del
 * controlador. No contiene lógica.
 */
export function crearSolicitudRouter(controller: SolicitudController): Router {
  const router = Router();

  router.get('/', controller.obtenerTodas);
  router.post('/', controller.crear);
  router.put('/:id', controller.actualizar);
  router.patch('/:id/estado', controller.actualizarEstado);
  router.delete('/:id', controller.eliminar);

  return router;
}

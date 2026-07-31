import express, { Application } from 'express';
import { Database } from './infrastructure/database/Database';
import { PostgresSolicitudRepository } from './infrastructure/repositories/PostgresSolicitudRepository';
import { SolicitudService } from './application/services/SolicitudService';
import { SolicitudController } from './presentation/controllers/SolicitudController';
import { crearSolicitudRouter } from './presentation/routes/solicitud.routes';
import { errorHandler } from './presentation/middlewares/errorHandler';
import { notFoundRoute } from './presentation/middlewares/notFoundRoute';

export function crearApp(): Application {
  const app = express();
  app.use(express.json());

  // --- Composición de dependencias (DIP en la práctica) ---
  // Este es el ÚNICO lugar donde se decide qué implementación concreta
  // del repositorio se usa. Cambiar a `new InMemorySolicitudRepository()`
  // (por ejemplo, para correr pruebas sin Docker) no requiere tocar el
  // controller, el service, ni las rutas.
  const pool = Database.getPool();
  const repositorio = new PostgresSolicitudRepository(pool);
  const service = new SolicitudService(repositorio);
  const controller = new SolicitudController(service);

  app.use('/api/solicitudes', crearSolicitudRouter(controller));

  // Middlewares finales: primero rutas no encontradas, luego errores.
  app.use(notFoundRoute);
  app.use(errorHandler);

  return app;
}

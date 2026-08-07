import express, { Application } from 'express';
import { AutorizacionController } from './presentation/controllers/AutorizacionController';
import { crearAutorizacionRouter } from './presentation/routes/autorizacion.routes';
import { simularFallosOcasionales } from './presentation/middlewares/simularFallos';

export function crearApp(): Application {
  const app = express();
  app.use(express.json());
  app.use(simularFallosOcasionales);

  const controller = new AutorizacionController();
  app.use('/', crearAutorizacionRouter(controller));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada en authorization-service.' });
  });

  return app;
}

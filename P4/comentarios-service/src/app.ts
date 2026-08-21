import express, { Application, Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { comentariosRouter } from './comentarios.routes';
import { verificarToken } from './auth';
import { AppError, ValidationError } from './errors';

export function crearApp(): Application {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use('/comentarios', verificarToken, comentariosRouter);

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: `La ruta ${req.method} ${req.originalUrl} no existe.` });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ValidationError) {
      res.status(err.statusCode).json({ error: err.message, detalles: err.detalles });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
      return;
    }
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('Error de infraestructura no controlado:', err);
    res.status(500).json({ error: 'Ocurrió un error interno en el servidor.' });
  });

  return app;
}

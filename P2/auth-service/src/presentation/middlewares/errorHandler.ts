import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../errors/AppError';
import { ValidationError } from '../../errors/ValidationError';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
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
}

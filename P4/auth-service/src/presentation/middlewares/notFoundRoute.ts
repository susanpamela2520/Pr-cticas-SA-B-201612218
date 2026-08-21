import { Request, Response } from 'express';

export function notFoundRoute(req: Request, res: Response): void {
  res.status(404).json({ error: `La ruta ${req.method} ${req.originalUrl} no existe.` });
}

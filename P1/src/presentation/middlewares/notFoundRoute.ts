import { Request, Response } from 'express';

/**
 * Cuando alguien pide una ruta que no existe, Express por defecto
 * devuelve una página HTML de error. Aquí forzamos una respuesta JSON
 * consistente con el resto de la API.
 */
export function notFoundRoute(req: Request, res: Response): void {
  res.status(404).json({ error: `La ruta ${req.method} ${req.originalUrl} no existe.` });
}

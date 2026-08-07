import { Request, Response, NextFunction } from 'express';

/**
 * Middleware de demostración: si AUTHZ_SIMULATE_FAILURE_RATE > 0 (variable
 * de entorno, valor entre 0 y 1), este servicio falla aleatoriamente esa
 * proporción de peticiones con un 500. Sirve exclusivamente para poder
 * enseñarle a Kevin, en vivo, que el backend principal reintenta con
 * backoff antes de rendirse. En operación normal esta variable debe
 * quedar en 0.
 */
export function simularFallosOcasionales(req: Request, res: Response, next: NextFunction): void {
  const tasa = Number(process.env.AUTHZ_SIMULATE_FAILURE_RATE) || 0;
  if (tasa > 0 && Math.random() < tasa) {
    console.log('[authorization-service] Falla simulada a propósito (demo de retry/backoff).');
    res.status(500).json({ error: 'Falla simulada (demostración de reintentos).' });
    return;
  }
  next();
}

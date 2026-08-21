import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from './errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: { id: string; rol: string };
    }
  }
}

/**
 * Igual que en tickets-service (Python): este servicio NO llama a
 * auth-service por red para verificar la sesión. Verifica la firma
 * del JWT localmente usando el mismo JWT_SECRET compartido — JWT es
 * un mecanismo de autenticación sin estado por diseño, así que
 * cualquier servicio que conozca el secreto puede confiar en el token
 * sin depender de la disponibilidad de auth-service en cada petición.
 *
 * A diferencia de auth-service, aquí NO se renueva el token si expiró
 * (esa responsabilidad queda centralizada en auth-service).
 */
export function verificarToken(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.access_token;
  if (!token) {
    next(new UnauthorizedError('No se encontró una sesión activa.'));
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || '') as { sub: string; rol: string };
    req.usuario = { id: payload.sub, rol: payload.rol };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('La sesión expiró. Inicia sesión de nuevo.'));
      return;
    }
    next(new UnauthorizedError('Token inválido.'));
  }
}

import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../../application/services/TokenService';
import { UnauthorizedError } from '../../errors/UnauthorizedError';
import { NOMBRE_COOKIE, opcionesCookie } from '../cookieConfig';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: { id: string; rol: string };
    }
  }
}

export function crearMiddlewareVerificarToken(tokenService: TokenService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.cookies?.[NOMBRE_COOKIE];
    if (!token) {
      next(new UnauthorizedError('No se encontró una sesión activa.'));
      return;
    }
    try {
      const { payload, nuevoToken } = tokenService.verificarConRenovacion(token);
      req.usuario = { id: payload.sub, rol: payload.rol };
      if (nuevoToken) {
        res.cookie(NOMBRE_COOKIE, nuevoToken, opcionesCookie(tokenService.ttlEnMilisegundos));
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

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

/**
 * Lee el JWT desde la cookie HTTP-only (nunca desde el body ni desde un
 * header — el enunciado exige que el token no sea visible/manipulable
 * por el usuario). Si el token expiró pero sigue dentro del período de
 * gracia, TokenService lo renueva; aquí simplemente reescribimos la
 * cookie con el nuevo valor antes de continuar.
 */
export function crearMiddlewareVerificarToken(tokenService: TokenService) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = req.cookies?.[NOMBRE_COOKIE];

    if (!token) {
      next(new UnauthorizedError('No se encontró una sesión activa.'));
      return;
    }

    try {
      const { payload, nuevoToken } = tokenService.verificarConRenovacion(token);
      req.usuario = { id: payload.sub, rol: payload.rol };

      if (nuevoToken) {
        _res.cookie(NOMBRE_COOKIE, nuevoToken, opcionesCookie(tokenService.ttlEnMilisegundos));
        console.log(`[auth-service] Token renovado automáticamente para usuario ${payload.sub}.`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

import { Request, Response, NextFunction } from 'express';
import { IAutorizacionClient } from '../../infrastructure/authorization/IAutorizacionClient';
import { ForbiddenError } from '../../errors/ForbiddenError';
import { UnauthorizedError } from '../../errors/UnauthorizedError';

/**
 * Requiere que `verificarToken` ya haya corrido antes (para tener
 * `req.usuario`). Delega la decisión de "¿puede este rol usar este
 * recurso?" al microservicio de autorización a través del cliente
 * inyectado (DIP) — este middleware no conoce el mapa de permisos, solo
 * sabe a quién preguntarle.
 */
export function crearMiddlewareAutorizar(cliente: IAutorizacionClient, recurso: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.usuario) {
      next(new UnauthorizedError('No se encontró una sesión activa.'));
      return;
    }

    try {
      const permitido = await cliente.verificarPermiso(req.usuario.rol, recurso);
      if (!permitido) {
        next(new ForbiddenError(`El rol "${req.usuario.rol}" no tiene acceso a "${recurso}".`));
        return;
      }
      next();
    } catch (error) {
      // Si el cliente agotó los reintentos, esto ya viene como ServiceUnavailableError.
      next(error);
    }
  };
}

import { AppError } from './AppError';

/**
 * Se lanza cuando el usuario SÍ está autenticado, pero su rol no tiene
 * permiso sobre el recurso (según el microservicio de autorización).
 */
export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  constructor(mensaje: string = 'No tiene permisos para acceder a este recurso.') {
    super(mensaje);
  }
}

import { AppError } from './AppError';

/**
 * Error de negocio: se lanza cuando se busca, actualiza o elimina
 * una solicitud que no existe. Se traduce a un HTTP 404.
 */
export class NotFoundError extends AppError {
  readonly statusCode = 404;

  constructor(recurso: string, id: string) {
    super(`${recurso} con id "${id}" no fue encontrado.`);
  }
}

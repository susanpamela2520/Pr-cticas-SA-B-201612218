import { AppError } from './AppError';

/**
 * Se lanza cuando no hay sesión, el token es inválido, o expiró fuera
 * del período de gracia de renovación.
 */
export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  constructor(mensaje: string = 'No autenticado.') {
    super(mensaje);
  }
}

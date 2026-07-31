import { AppError } from './AppError';

/**
 * Error de negocio: se lanza cuando los datos enviados por el cliente
 * no cumplen las reglas de validación. Se traduce a un HTTP 400.
 * Guarda el detalle de cada campo inválido para devolver un mensaje útil.
 */
export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly detalles: string[];

  constructor(detalles: string[]) {
    super('Los datos enviados no son válidos.');
    this.detalles = detalles;
  }
}

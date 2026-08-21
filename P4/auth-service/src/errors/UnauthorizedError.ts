import { AppError } from './AppError';

export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  constructor(mensaje: string = 'No autenticado.') {
    super(mensaje);
  }
}

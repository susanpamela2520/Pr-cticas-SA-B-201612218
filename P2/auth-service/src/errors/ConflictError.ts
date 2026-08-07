import { AppError } from './AppError';

export class ConflictError extends AppError {
  readonly statusCode = 409;
  constructor(mensaje: string) {
    super(mensaje);
  }
}

import { AppError } from './AppError';

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly detalles: string[];
  constructor(detalles: string[]) {
    super('Los datos enviados no son válidos.');
    this.detalles = detalles;
  }
}

import { AppError } from './AppError';

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  constructor(recurso: string, id: string) {
    super(`${recurso} con id "${id}" no fue encontrado.`);
  }
}

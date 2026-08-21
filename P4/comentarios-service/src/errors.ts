export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly detalles: string[];
  constructor(detalles: string[]) {
    super('Los datos enviados no son válidos.');
    this.detalles = detalles;
  }
}

export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  constructor(mensaje: string = 'No autenticado.') {
    super(mensaje);
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  constructor(recurso: string, id: string) {
    super(`${recurso} con id "${id}" no fue encontrado.`);
  }
}

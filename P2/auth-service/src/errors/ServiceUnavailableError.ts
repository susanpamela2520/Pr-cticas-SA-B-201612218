import { AppError } from './AppError';

/**
 * Se lanza cuando, después de agotar todos los reintentos configurados,
 * el microservicio de autorización sigue sin responder. Es un error de
 * infraestructura (no del usuario), pero con código propio porque
 * queremos distinguirlo claramente de un 500 genérico en los logs y en
 * la respuesta.
 */
export class ServiceUnavailableError extends AppError {
  readonly statusCode = 503;
  constructor(servicio: string) {
    super(`El servicio "${servicio}" no respondió después de varios intentos.`);
  }
}

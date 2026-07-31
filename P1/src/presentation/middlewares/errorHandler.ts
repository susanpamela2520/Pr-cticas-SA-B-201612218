import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../errors/AppError';
import { ValidationError } from '../../errors/ValidationError';

/**
 * Middleware ÚNICO de manejo de errores para toda la API.
 *
 * Esto responde directamente la duda planteada en el foro:
 * "¿cómo separar errores de negocio (400/404) de errores de
 * infraestructura (500) sin duplicar código ni crear un nuevo tipo
 * de error?"
 *
 * La respuesta: este middleware NO CREA ningún error nuevo. Solo
 * interpreta los que ya existen y decide qué código HTTP corresponde:
 *  - ValidationError / AppError conocidos -> error de negocio (400/404)
 *  - JSON mal formado en el body          -> 400 (petición del cliente,
 *                                             no una falla nuestra)
 *  - cualquier otra cosa (fallo real de DB, bug, etc.) -> 500
 *
 * SRP: su única responsabilidad es "traducir un error a una respuesta
 * HTTP". No valida, no accede a datos.
 *
 * OCP: si mañana se agrega un ConflictError (409) que extienda AppError,
 * este archivo no se toca: el `if (err instanceof AppError)` ya lo cubre.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ValidationError) {
    res.status(err.statusCode).json({ error: err.message, detalles: err.detalles });
    return;
  }

  // express.json() lanza un SyntaxError cuando el body no es JSON válido.
  // Sin este chequeo, ese error caía al 500 genérico (justo el problema
  // que se comentó en el foro: un JSON inválido terminaba viéndose como
  // una falla interna en vez de un error del cliente).
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  console.error('Error de infraestructura no controlado:', err);
  res.status(500).json({ error: 'Ocurrió un error interno en el servidor.' });
}

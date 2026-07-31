/**
 * Clase base para todos los errores "de negocio" de la aplicación
 * (los que se pueden anticipar: datos inválidos, recurso no encontrado, etc.)
 *
 * OCP (Open/Closed Principle):
 * Para agregar un nuevo tipo de error de negocio (por ejemplo, un
 * ConflictError para una regla como "no se puede eliminar una solicitud
 * en_proceso"), basta con crear una nueva clase que extienda AppError.
 * El middleware que traduce errores a respuestas HTTP (errorHandler.ts)
 * NO necesita modificarse para soportar el nuevo tipo: sigue funcionando
 * porque solo pregunta "¿es una instancia de AppError?".
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

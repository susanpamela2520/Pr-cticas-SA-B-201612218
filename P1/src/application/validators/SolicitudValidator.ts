import { ValidationError } from '../../errors/ValidationError';

// Se usa un Record sobre las claves conocidas (no un índice genérico de
// string) para que los DTOs reales (NuevaSolicitudDTO, ActualizarSolicitudDTO)
// sean asignables directamente, sin perder el chequeo de tipos.
type CampoConocido = 'titulo' | 'areaSolicitante' | 'prioridad' | 'costoEstimado' | 'estado';
type DatosEntrada = Partial<Record<CampoConocido, unknown>>;
type ReglaValidacion = (datos: DatosEntrada) => string | null;

const ESTADOS_VALIDOS = ['registrada', 'en_proceso', 'finalizada'];

// Cada regla es una función pequeña con una sola responsabilidad:
// revisar un único campo y devolver un mensaje de error o null.

const reglaTitulo: ReglaValidacion = (d) => {
  if (typeof d.titulo !== 'string' || d.titulo.trim().length < 3) {
    return 'El campo "titulo" es obligatorio y debe tener al menos 3 caracteres.';
  }
  return null;
};

const reglaAreaSolicitante: ReglaValidacion = (d) => {
  if (typeof d.areaSolicitante !== 'string' || d.areaSolicitante.trim().length === 0) {
    return 'El campo "areaSolicitante" es obligatorio.';
  }
  return null;
};

const reglaPrioridad: ReglaValidacion = (d) => {
  const valor = Number(d.prioridad);
  if (!Number.isInteger(valor) || valor < 1 || valor > 5) {
    return 'El campo "prioridad" debe ser un entero entre 1 y 5.';
  }
  return null;
};

const reglaCostoEstimado: ReglaValidacion = (d) => {
  const valor = Number(d.costoEstimado);
  if (Number.isNaN(valor) || valor < 0) {
    return 'El campo "costoEstimado" debe ser un número mayor o igual a 0.';
  }
  return null;
};

const reglaEstado = (obligatorio: boolean): ReglaValidacion => (d) => {
  if (!obligatorio && d.estado === undefined) return null;
  if (typeof d.estado !== 'string' || !ESTADOS_VALIDOS.includes(d.estado)) {
    return `El campo "estado" debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}.`;
  }
  return null;
};

/**
 * SRP: esta clase solo se encarga de validar datos de entrada; no sabe
 * nada de HTTP ni de base de datos.
 *
 * OCP: si mañana se necesita una nueva regla (por ejemplo, longitud máxima
 * de "titulo"), se agrega una función nueva y se añade al arreglo de la
 * lista correspondiente. No hay que tocar el método `ejecutar` ni las
 * reglas que ya existen y ya están probadas.
 */
export class SolicitudValidator {
  static validarCreacion(datos: DatosEntrada): void {
    this.ejecutar(datos, [
      reglaTitulo,
      reglaAreaSolicitante,
      reglaPrioridad,
      reglaCostoEstimado,
      reglaEstado(false),
    ]);
  }

  static validarActualizacion(datos: DatosEntrada): void {
    this.ejecutar(datos, [
      reglaTitulo,
      reglaAreaSolicitante,
      reglaPrioridad,
      reglaCostoEstimado,
      reglaEstado(true),
    ]);
  }

  static validarEstado(datos: DatosEntrada): void {
    this.ejecutar(datos, [reglaEstado(true)]);
  }

  private static ejecutar(datos: DatosEntrada, reglas: ReglaValidacion[]): void {
    const errores = reglas
      .map((regla) => regla(datos))
      .filter((mensaje): mensaje is string => mensaje !== null);

    if (errores.length > 0) {
      throw new ValidationError(errores);
    }
  }
}

import { ValidationError } from '../../errors/ValidationError';

type CampoConocido = 'nombre' | 'correo' | 'contrasena' | 'rol';
type DatosEntrada = Partial<Record<CampoConocido, unknown>>;
type ReglaValidacion = (datos: DatosEntrada) => string | null;

const ROLES_VALIDOS = ['Admin', 'Cliente'];
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const reglaNombre: ReglaValidacion = (d) => {
  if (typeof d.nombre !== 'string' || d.nombre.trim().length < 2) {
    return 'El campo "nombre" es obligatorio y debe tener al menos 2 caracteres.';
  }
  return null;
};

const reglaCorreo: ReglaValidacion = (d) => {
  if (typeof d.correo !== 'string' || !REGEX_CORREO.test(d.correo)) {
    return 'El campo "correo" es obligatorio y debe tener un formato válido.';
  }
  return null;
};

const reglaContrasena: ReglaValidacion = (d) => {
  if (typeof d.contrasena !== 'string' || d.contrasena.length < 8) {
    return 'El campo "contrasena" es obligatorio y debe tener al menos 8 caracteres.';
  }
  return null;
};

const reglaRol = (obligatorio: boolean): ReglaValidacion => (d) => {
  if (!obligatorio && d.rol === undefined) return null;
  if (typeof d.rol !== 'string' || !ROLES_VALIDOS.includes(d.rol)) {
    return `El campo "rol" debe ser uno de: ${ROLES_VALIDOS.join(', ')}.`;
  }
  return null;
};

export class AuthValidator {
  static validarRegistro(datos: DatosEntrada): void {
    this.ejecutar(datos, [reglaNombre, reglaCorreo, reglaContrasena, reglaRol(false)]);
  }

  static validarLogin(datos: DatosEntrada): void {
    this.ejecutar(datos, [reglaCorreo, reglaContrasena]);
  }

  private static ejecutar(datos: DatosEntrada, reglas: ReglaValidacion[]): void {
    const errores = reglas.map((regla) => regla(datos)).filter((m): m is string => m !== null);
    if (errores.length > 0) throw new ValidationError(errores);
  }
}

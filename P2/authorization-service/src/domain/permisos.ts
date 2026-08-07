/**
 * Este microservicio es intencionalmente tonto: no conoce usuarios, no
 * conoce contraseñas, no toca base de datos. Solo sabe una cosa: dado
 * un rol y un recurso, ¿está permitido el acceso?
 *
 * Esto es lo que exige el enunciado: un servicio de autorización
 * DESACOPLADO del servicio de autenticación.
 */
export const PERMISOS_POR_RECURSO: Record<string, string[]> = {
  ruta1: ['Admin'],
  ruta2: ['Admin', 'Cliente'],
};

export function evaluarPermiso(rol: string, recurso: string): boolean {
  const rolesPermitidos = PERMISOS_POR_RECURSO[recurso];
  if (!rolesPermitidos) return false;
  return rolesPermitidos.includes(rol);
}

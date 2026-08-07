export type Rol = 'Admin' | 'Cliente';

/**
 * Representa la fila tal como vive en la base de datos: los campos
 * sensibles siguen cifrados. Esta forma NUNCA sale del backend tal cual.
 */
export interface UsuarioAlmacenado {
  id: string;
  nombreCifrado: string;
  correoCifrado: string;
  correoHash: string;
  contrasenaCifrada: string;
  rol: Rol;
}

/**
 * Representa al usuario ya descifrado, listo para mostrarse o para
 * comparar la contraseña en el login. Nunca se persiste en este formato.
 */
export interface UsuarioDescifrado {
  id: string;
  nombre: string;
  correo: string;
  contrasena: string;
  rol: Rol;
}

/**
 * Lo que efectivamente se le devuelve al cliente HTTP: nunca incluye la
 * contraseña, ni siquiera descifrada.
 */
export interface UsuarioPublico {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
}

export interface NuevoUsuarioDTO {
  nombre: string;
  correo: string;
  contrasena: string;
  rol?: Rol;
}

export interface NuevoUsuarioCifradoDTO {
  nombreCifrado: string;
  correoCifrado: string;
  correoHash: string;
  contrasenaCifrada: string;
  rol: Rol;
}

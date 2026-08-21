export type Rol = 'Cliente' | 'Agente' | 'Admin';

export interface UsuarioAlmacenado {
  id: string;
  nombreCifrado: string;
  correoCifrado: string;
  correoHash: string;
  contrasenaCifrada: string;
  rol: Rol;
}

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

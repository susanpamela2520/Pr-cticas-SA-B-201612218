/**
 * DIP: el middleware de autorización depende de esta interfaz, no de
 * axios ni de la URL del microservicio directamente. Eso permitiría,
 * por ejemplo, inyectar un cliente falso en pruebas sin levantar el
 * microservicio real.
 */
export interface IAutorizacionClient {
  verificarPermiso(rol: string, recurso: string): Promise<boolean>;
}

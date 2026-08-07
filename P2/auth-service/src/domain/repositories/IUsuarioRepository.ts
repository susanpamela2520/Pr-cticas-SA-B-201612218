import { UsuarioAlmacenado, NuevoUsuarioCifradoDTO } from '../models/Usuario';

export interface IUsuarioReader {
  buscarPorId(id: string): Promise<UsuarioAlmacenado | null>;
  buscarPorCorreoHash(correoHash: string): Promise<UsuarioAlmacenado | null>;
}

export interface IUsuarioWriter {
  crear(datos: NuevoUsuarioCifradoDTO): Promise<UsuarioAlmacenado>;
}

/**
 * DIP: AuthService depende de esta abstracción, nunca de
 * PostgresUsuarioRepository directamente. Ver InMemoryUsuarioRepository
 * para la implementación intercambiable (evidencia de LSP).
 */
export interface IUsuarioRepository extends IUsuarioReader, IUsuarioWriter {}

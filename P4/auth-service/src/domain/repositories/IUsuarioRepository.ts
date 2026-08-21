import { UsuarioAlmacenado, NuevoUsuarioDTO } from '../models/Usuario';

export interface IUsuarioRepository {
  buscarPorId(id: string): Promise<UsuarioAlmacenado | null>;
  buscarPorCorreoHash(correoHash: string): Promise<UsuarioAlmacenado | null>;
  crear(datos: {
    nombreCifrado: string;
    correoCifrado: string;
    correoHash: string;
    contrasenaCifrada: string;
    rol: NuevoUsuarioDTO['rol'];
  }): Promise<UsuarioAlmacenado>;
}

import { randomUUID } from 'crypto';
import { IUsuarioRepository } from '../../domain/repositories/IUsuarioRepository';
import { UsuarioAlmacenado, NuevoUsuarioCifradoDTO } from '../../domain/models/Usuario';

export class InMemoryUsuarioRepository implements IUsuarioRepository {
  private usuarios: UsuarioAlmacenado[] = [];

  async buscarPorId(id: string): Promise<UsuarioAlmacenado | null> {
    return this.usuarios.find((u) => u.id === id) ?? null;
  }

  async buscarPorCorreoHash(correoHash: string): Promise<UsuarioAlmacenado | null> {
    return this.usuarios.find((u) => u.correoHash === correoHash) ?? null;
  }

  async crear(datos: NuevoUsuarioCifradoDTO): Promise<UsuarioAlmacenado> {
    const nuevo: UsuarioAlmacenado = { id: randomUUID(), ...datos };
    this.usuarios.push(nuevo);
    return nuevo;
  }
}

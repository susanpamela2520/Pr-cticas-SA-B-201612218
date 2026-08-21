import { Pool } from 'pg';
import { IUsuarioRepository } from '../../domain/repositories/IUsuarioRepository';
import { UsuarioAlmacenado } from '../../domain/models/Usuario';

export class PostgresUsuarioRepository implements IUsuarioRepository {
  constructor(private readonly pool: Pool) {}

  async buscarPorId(id: string): Promise<UsuarioAlmacenado | null> {
    const resultado = await this.pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    return resultado.rows[0] ? this.aDominio(resultado.rows[0]) : null;
  }

  async buscarPorCorreoHash(correoHash: string): Promise<UsuarioAlmacenado | null> {
    const resultado = await this.pool.query('SELECT * FROM usuarios WHERE correo_hash = $1', [correoHash]);
    return resultado.rows[0] ? this.aDominio(resultado.rows[0]) : null;
  }

  async crear(datos: {
    nombreCifrado: string;
    correoCifrado: string;
    correoHash: string;
    contrasenaCifrada: string;
    rol: any;
  }): Promise<UsuarioAlmacenado> {
    const resultado = await this.pool.query(
      `INSERT INTO usuarios (nombre_cifrado, correo_cifrado, correo_hash, contrasena_cifrada, rol)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [datos.nombreCifrado, datos.correoCifrado, datos.correoHash, datos.contrasenaCifrada, datos.rol ?? 'Cliente']
    );
    return this.aDominio(resultado.rows[0]);
  }

  private aDominio(fila: any): UsuarioAlmacenado {
    return {
      id: fila.id,
      nombreCifrado: fila.nombre_cifrado,
      correoCifrado: fila.correo_cifrado,
      correoHash: fila.correo_hash,
      contrasenaCifrada: fila.contrasena_cifrada,
      rol: fila.rol,
    };
  }
}

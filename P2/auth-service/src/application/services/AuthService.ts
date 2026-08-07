import { IUsuarioRepository } from '../../domain/repositories/IUsuarioRepository';
import { AesCipher } from '../../infrastructure/security/AesCipher';
import { hashCorreo } from '../../infrastructure/security/hashCorreo';
import { TokenService } from './TokenService';
import { NotFoundError } from '../../errors/NotFoundError';
import { UnauthorizedError } from '../../errors/UnauthorizedError';
import { ConflictError } from '../../errors/ConflictError';
import { NuevoUsuarioDTO, UsuarioPublico, UsuarioAlmacenado } from '../../domain/models/Usuario';

/**
 * SRP: reglas de negocio de autenticación. No sabe de HTTP ni de SQL.
 * DIP: depende de ISolicitudRepository (abstracción), de AesCipher y de
 * TokenService inyectados por constructor — nunca los instancia él mismo.
 */
export class AuthService {
  constructor(
    private readonly repositorio: IUsuarioRepository,
    private readonly cifrador: AesCipher,
    private readonly tokenService: TokenService,
    private readonly secretoHash: string
  ) {}

  async registrar(datos: NuevoUsuarioDTO): Promise<UsuarioPublico> {
    const correoHash = hashCorreo(datos.correo, this.secretoHash);

    const existente = await this.repositorio.buscarPorCorreoHash(correoHash);
    if (existente) {
      throw new ConflictError('Ya existe un usuario registrado con ese correo.');
    }

    const creado = await this.repositorio.crear({
      nombreCifrado: this.cifrador.encriptar(datos.nombre),
      correoCifrado: this.cifrador.encriptar(datos.correo),
      correoHash,
      contrasenaCifrada: this.cifrador.encriptar(datos.contrasena),
      rol: datos.rol ?? 'Cliente',
    });

    return this.aPublico(creado);
  }

  async login(datos: { correo: string; contrasena: string }): Promise<{ usuario: UsuarioPublico; token: string }> {
    const correoHash = hashCorreo(datos.correo, this.secretoHash);
    const fila = await this.repositorio.buscarPorCorreoHash(correoHash);

    // Mensaje genérico a propósito: no revelar si fue el correo o la
    // contraseña lo que falló (evita que alguien "adivine" correos válidos).
    if (!fila) {
      throw new UnauthorizedError('Correo o contraseña incorrectos.');
    }

    const contrasenaAlmacenada = this.cifrador.desencriptar(fila.contrasenaCifrada);
    if (contrasenaAlmacenada !== datos.contrasena) {
      throw new UnauthorizedError('Correo o contraseña incorrectos.');
    }

    const token = this.tokenService.generar({ sub: fila.id, rol: fila.rol });
    return { usuario: this.aPublico(fila), token };
  }

  async obtenerPerfil(id: string): Promise<UsuarioPublico> {
    const fila = await this.repositorio.buscarPorId(id);
    if (!fila) throw new NotFoundError('Usuario', id);
    return this.aPublico(fila);
  }

  private aPublico(fila: UsuarioAlmacenado): UsuarioPublico {
    return {
      id: fila.id,
      nombre: this.cifrador.desencriptar(fila.nombreCifrado),
      correo: this.cifrador.desencriptar(fila.correoCifrado),
      rol: fila.rol,
    };
  }
}

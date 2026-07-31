import { ISolicitudRepository } from '../../domain/repositories/ISolicitudRepository';
import { SolicitudValidator } from '../validators/SolicitudValidator';
import { NotFoundError } from '../../errors/NotFoundError';
import {
  SolicitudOperativa,
  NuevaSolicitudDTO,
  ActualizarSolicitudDTO,
  EstadoSolicitud,
} from '../../domain/models/SolicitudOperativa';

/**
 * SRP: esta clase solo contiene reglas de negocio (qué hacer, en qué orden,
 * qué error lanzar). No sabe nada de HTTP (eso es del controller) ni de SQL
 * (eso es del repository).
 *
 * DIP: el constructor recibe una ISolicitudRepository (abstracción), no una
 * clase concreta. Quien arma la aplicación (app.ts) decide qué implementación
 * inyectar: PostgresSolicitudRepository en producción, o
 * InMemorySolicitudRepository para pruebas rápidas.
 */
export class SolicitudService {
  constructor(private readonly repositorio: ISolicitudRepository) {}

  async obtenerTodas(): Promise<SolicitudOperativa[]> {
    return this.repositorio.findAll();
  }

  async crear(datos: NuevaSolicitudDTO): Promise<SolicitudOperativa> {
    SolicitudValidator.validarCreacion(datos);
    return this.repositorio.create(datos);
  }

  async actualizar(id: string, datos: ActualizarSolicitudDTO): Promise<SolicitudOperativa> {
    SolicitudValidator.validarActualizacion(datos);
    const actualizada = await this.repositorio.update(id, datos);
    if (!actualizada) {
      throw new NotFoundError('Solicitud operativa', id);
    }
    return actualizada;
  }

  async actualizarEstado(id: string, estado: EstadoSolicitud): Promise<SolicitudOperativa> {
    SolicitudValidator.validarEstado({ estado });
    const actualizada = await this.repositorio.updateEstado(id, estado);
    if (!actualizada) {
      throw new NotFoundError('Solicitud operativa', id);
    }
    return actualizada;
  }

  async eliminar(id: string): Promise<void> {
    const eliminada = await this.repositorio.delete(id);
    if (!eliminada) {
      throw new NotFoundError('Solicitud operativa', id);
    }
  }
}

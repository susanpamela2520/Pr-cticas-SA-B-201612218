import { randomUUID } from 'crypto';
import { ISolicitudRepository } from '../../domain/repositories/ISolicitudRepository';
import {
  SolicitudOperativa,
  NuevaSolicitudDTO,
  ActualizarSolicitudDTO,
  EstadoSolicitud,
} from '../../domain/models/SolicitudOperativa';

/**
 * LSP (Liskov Substitution Principle):
 * Esta clase implementa exactamente el mismo contrato (ISolicitudRepository)
 * que PostgresSolicitudRepository, y se comporta de forma consistente con
 * él (mismos casos de éxito, mismos casos "no encontrado" devolviendo null).
 * Por eso SolicitudService puede recibir esta clase EN LUGAR DE la de
 * Postgres sin que nada se rompa: ambas son sustituibles entre sí porque
 * cumplen la misma promesa. Es útil para pruebas rápidas sin base de datos.
 */
export class InMemorySolicitudRepository implements ISolicitudRepository {
  private solicitudes: SolicitudOperativa[] = [];

  async findAll(): Promise<SolicitudOperativa[]> {
    return [...this.solicitudes];
  }

  async findById(id: string): Promise<SolicitudOperativa | null> {
    return this.solicitudes.find((s) => s.id === id) ?? null;
  }

  async create(data: NuevaSolicitudDTO): Promise<SolicitudOperativa> {
    const nueva: SolicitudOperativa = {
      id: randomUUID(),
      titulo: data.titulo,
      areaSolicitante: data.areaSolicitante,
      prioridad: data.prioridad,
      costoEstimado: data.costoEstimado,
      estado: data.estado ?? 'registrada',
    };
    this.solicitudes.push(nueva);
    return nueva;
  }

  async update(id: string, data: ActualizarSolicitudDTO): Promise<SolicitudOperativa | null> {
    const indice = this.solicitudes.findIndex((s) => s.id === id);
    if (indice === -1) return null;
    this.solicitudes[indice] = { id, ...data };
    return this.solicitudes[indice];
  }

  async updateEstado(id: string, estado: EstadoSolicitud): Promise<SolicitudOperativa | null> {
    const indice = this.solicitudes.findIndex((s) => s.id === id);
    if (indice === -1) return null;
    this.solicitudes[indice] = { ...this.solicitudes[indice], estado };
    return this.solicitudes[indice];
  }

  async delete(id: string): Promise<boolean> {
    const largoAntes = this.solicitudes.length;
    this.solicitudes = this.solicitudes.filter((s) => s.id !== id);
    return this.solicitudes.length < largoAntes;
  }
}

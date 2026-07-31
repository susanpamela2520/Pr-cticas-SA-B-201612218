import { Pool } from 'pg';
import { ISolicitudRepository } from '../../domain/repositories/ISolicitudRepository';
import {
  SolicitudOperativa,
  NuevaSolicitudDTO,
  ActualizarSolicitudDTO,
  EstadoSolicitud,
} from '../../domain/models/SolicitudOperativa';

/**
 * SRP: esta clase solo sabe traducir operaciones de la solicitud a SQL
 * y de vuelta a objetos del dominio. No valida datos de negocio (eso ya
 * lo hizo el validator antes de llegar aquí) ni arma respuestas HTTP.
 *
 * Seguridad: todas las consultas usan parámetros ($1, $2, ...) en vez de
 * concatenar strings. Esto es lo que evita la inyección SQL: el valor
 * viajado por el usuario nunca se interpreta como parte del comando SQL.
 */
export class PostgresSolicitudRepository implements ISolicitudRepository {
  constructor(private readonly pool: Pool) {}

  async findAll(): Promise<SolicitudOperativa[]> {
    const resultado = await this.pool.query(
      'SELECT * FROM solicitudes_operativas ORDER BY creado_en DESC'
    );
    return resultado.rows.map(this.aDominio);
  }

  async findById(id: string): Promise<SolicitudOperativa | null> {
    const resultado = await this.pool.query(
      'SELECT * FROM solicitudes_operativas WHERE id = $1',
      [id]
    );
    return resultado.rows[0] ? this.aDominio(resultado.rows[0]) : null;
  }

  async create(data: NuevaSolicitudDTO): Promise<SolicitudOperativa> {
    const resultado = await this.pool.query(
      `INSERT INTO solicitudes_operativas
         (titulo, area_solicitante, prioridad, costo_estimado, estado)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.titulo,
        data.areaSolicitante,
        data.prioridad,
        data.costoEstimado,
        data.estado ?? 'registrada',
      ]
    );
    return this.aDominio(resultado.rows[0]);
  }

  async update(id: string, data: ActualizarSolicitudDTO): Promise<SolicitudOperativa | null> {
    const resultado = await this.pool.query(
      `UPDATE solicitudes_operativas
       SET titulo = $1, area_solicitante = $2, prioridad = $3,
           costo_estimado = $4, estado = $5
       WHERE id = $6
       RETURNING *`,
      [data.titulo, data.areaSolicitante, data.prioridad, data.costoEstimado, data.estado, id]
    );
    return resultado.rows[0] ? this.aDominio(resultado.rows[0]) : null;
  }

  async updateEstado(id: string, estado: EstadoSolicitud): Promise<SolicitudOperativa | null> {
    const resultado = await this.pool.query(
      `UPDATE solicitudes_operativas SET estado = $1 WHERE id = $2 RETURNING *`,
      [estado, id]
    );
    return resultado.rows[0] ? this.aDominio(resultado.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const resultado = await this.pool.query(
      'DELETE FROM solicitudes_operativas WHERE id = $1',
      [id]
    );
    return (resultado.rowCount ?? 0) > 0;
  }

  private aDominio(fila: any): SolicitudOperativa {
    return {
      id: fila.id,
      titulo: fila.titulo,
      areaSolicitante: fila.area_solicitante,
      prioridad: fila.prioridad,
      costoEstimado: Number(fila.costo_estimado),
      estado: fila.estado,
    };
  }
}

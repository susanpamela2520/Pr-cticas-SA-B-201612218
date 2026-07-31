import {
  SolicitudOperativa,
  NuevaSolicitudDTO,
  ActualizarSolicitudDTO,
  EstadoSolicitud,
} from '../models/SolicitudOperativa';

/**
 * ISP (Interface Segregation Principle):
 * Se separan las operaciones de LECTURA de las de ESCRITURA en dos
 * interfaces distintas. Si en el futuro se necesitara una clase que solo
 * consulte datos (por ejemplo, un servicio de reportes), esa clase podría
 * depender únicamente de ISolicitudReader sin verse obligada a implementar
 * métodos de escritura que no usa.
 */
export interface ISolicitudReader {
  findAll(): Promise<SolicitudOperativa[]>;
  findById(id: string): Promise<SolicitudOperativa | null>;
}

export interface ISolicitudWriter {
  create(data: NuevaSolicitudDTO): Promise<SolicitudOperativa>;
  update(id: string, data: ActualizarSolicitudDTO): Promise<SolicitudOperativa | null>;
  updateEstado(id: string, estado: EstadoSolicitud): Promise<SolicitudOperativa | null>;
  delete(id: string): Promise<boolean>;
}

/**
 * DIP (Dependency Inversion Principle):
 * La capa de aplicación (SolicitudService) depende únicamente de esta
 * abstracción, nunca de una clase concreta como PostgresSolicitudRepository.
 * Esto permite inyectar cualquier implementación (Postgres, en memoria,
 * un mock para pruebas) sin cambiar ni una línea del servicio.
 */
export interface ISolicitudRepository extends ISolicitudReader, ISolicitudWriter {}

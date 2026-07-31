/**
 * Estados válidos que puede tener una solicitud operativa.
 */
export type EstadoSolicitud = 'registrada' | 'en_proceso' | 'finalizada';

/**
 * Entidad principal del dominio. Representa una solicitud operativa
 * de la academia ficticia, tal como se maneja dentro de la aplicación
 * (independiente de cómo se guarde en la base de datos).
 */
export interface SolicitudOperativa {
  id: string;
  titulo: string;
  areaSolicitante: string;
  prioridad: number;
  costoEstimado: number;
  estado: EstadoSolicitud;
}

/**
 * Datos necesarios para crear una nueva solicitud.
 * El estado es opcional porque por defecto nace como "registrada".
 */
export interface NuevaSolicitudDTO {
  titulo: string;
  areaSolicitante: string;
  prioridad: number;
  costoEstimado: number;
  estado?: EstadoSolicitud;
}

/**
 * Datos necesarios para actualizar completamente una solicitud (PUT).
 * Aquí sí es obligatorio enviar el estado, porque se reemplaza el recurso entero.
 */
export interface ActualizarSolicitudDTO {
  titulo: string;
  areaSolicitante: string;
  prioridad: number;
  costoEstimado: number;
  estado: EstadoSolicitud;
}

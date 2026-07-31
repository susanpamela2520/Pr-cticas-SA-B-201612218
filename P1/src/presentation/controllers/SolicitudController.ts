import { Request, Response, NextFunction } from 'express';
import { SolicitudService } from '../../application/services/SolicitudService';

/**
 * SRP: el controlador SOLO sabe leer el request y armar el response.
 * No valida reglas de negocio, no sabe de SQL. Cualquier error se
 * reenvía con next(error) para que lo resuelva el errorHandler central.
 */
export class SolicitudController {
  constructor(private readonly service: SolicitudService) {}

  obtenerTodas = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const solicitudes = await this.service.obtenerTodas();
      res.status(200).json(solicitudes);
    } catch (error) {
      next(error);
    }
  };

  crear = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const nueva = await this.service.crear(req.body);
      res.status(201).json(nueva);
    } catch (error) {
      next(error);
    }
  };

  actualizar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actualizada = await this.service.actualizar(req.params.id, req.body);
      res.status(200).json(actualizada);
    } catch (error) {
      next(error);
    }
  };

  actualizarEstado = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actualizada = await this.service.actualizarEstado(req.params.id, req.body.estado);
      res.status(200).json(actualizada);
    } catch (error) {
      next(error);
    }
  };

  eliminar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.service.eliminar(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}

import { Request, Response } from 'express';
import { evaluarPermiso } from '../../domain/permisos';

export class AutorizacionController {
  autorizar = (req: Request, res: Response): void => {
    const { rol, recurso } = req.body ?? {};

    if (typeof rol !== 'string' || typeof recurso !== 'string') {
      res.status(400).json({ error: 'Se requieren "rol" y "recurso" en el body.' });
      return;
    }

    const permitido = evaluarPermiso(rol, recurso);
    res.status(200).json({ permitido });
  };
}

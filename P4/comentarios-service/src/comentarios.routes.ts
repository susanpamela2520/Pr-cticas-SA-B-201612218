import { Router, Request, Response, NextFunction } from 'express';
import { getPool } from './db';
import { ValidationError, NotFoundError } from './errors';

export const comentariosRouter = Router();

comentariosRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ticket_id, mensaje } = req.body ?? {};
    if (typeof ticket_id !== 'string' || typeof mensaje !== 'string' || mensaje.trim().length === 0) {
      throw new ValidationError(['Se requieren "ticket_id" (string) y "mensaje" (string no vacío).']);
    }

    const resultado = await getPool().query(
      `INSERT INTO comentarios (ticket_id, autor_id, autor_rol, mensaje)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [ticket_id, req.usuario!.id, req.usuario!.rol, mensaje]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    next(error);
  }
});

comentariosRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.query.ticket_id;
    if (typeof ticketId !== 'string') {
      throw new ValidationError(['El query param "ticket_id" es obligatorio.']);
    }

    const resultado = await getPool().query(
      'SELECT * FROM comentarios WHERE ticket_id = $1 ORDER BY creado_en ASC',
      [ticketId]
    );
    res.status(200).json(resultado.rows);
  } catch (error) {
    next(error);
  }
});

comentariosRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const resultado = await getPool().query('SELECT * FROM comentarios WHERE id = $1', [req.params.id]);
    if (!resultado.rows[0]) {
      throw new NotFoundError('Comentario', req.params.id);
    }
    res.status(200).json(resultado.rows[0]);
  } catch (error) {
    next(error);
  }
});

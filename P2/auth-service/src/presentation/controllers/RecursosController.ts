import { Request, Response } from 'express';

/**
 * Estos dos endpoints son deliberadamente simples: lo interesante no es
 * lo que devuelven, sino que para llegar aquí ya pasaron por
 * verificarToken (autenticación) y autorizar (autorización vía el
 * microservicio). Si el rol no tiene permiso, ni siquiera se ejecuta
 * este código — el middleware corta antes.
 */
export class RecursosController {
  ruta1Soloadmin = (req: Request, res: Response): void => {
    res.status(200).json({
      mensaje: 'Acceso concedido a Ruta 1 (solo Admin).',
      usuario: req.usuario,
    });
  };

  ruta2AdminYCliente = (req: Request, res: Response): void => {
    res.status(200).json({
      mensaje: 'Acceso concedido a Ruta 2 (Admin y Cliente).',
      usuario: req.usuario,
    });
  };
}

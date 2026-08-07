import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../application/services/AuthService';
import { AuthValidator } from '../../application/validators/AuthValidator';
import { TokenService } from '../../application/services/TokenService';
import { NOMBRE_COOKIE, opcionesCookie } from '../cookieConfig';

export class AuthController {
  constructor(private readonly service: AuthService, private readonly tokenService: TokenService) {}

  registrar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      AuthValidator.validarRegistro(req.body);
      const usuario = await this.service.registrar(req.body);
      res.status(201).json(usuario);
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      AuthValidator.validarLogin(req.body);
      const { usuario, token } = await this.service.login(req.body);
      res.cookie(NOMBRE_COOKIE, token, opcionesCookie(this.tokenService.ttlEnMilisegundos));
      res.status(200).json(usuario);
    } catch (error) {
      next(error);
    }
  };

  perfil = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const usuario = await this.service.obtenerPerfil(req.usuario!.id);
      res.status(200).json(usuario);
    } catch (error) {
      next(error);
    }
  };

  logout = (_req: Request, res: Response): void => {
    res.clearCookie(NOMBRE_COOKIE, { path: '/' });
    res.status(204).send();
  };
}

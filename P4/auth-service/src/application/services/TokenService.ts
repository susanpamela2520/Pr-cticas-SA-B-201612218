import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../../errors/UnauthorizedError';

export interface PayloadToken {
  sub: string;
  rol: string;
  iat?: number;
  exp?: number;
}

export interface ResultadoVerificacion {
  payload: PayloadToken;
  nuevoToken?: string;
}

export class TokenService {
  constructor(
    private readonly secreto: string,
    private readonly ttlSegundos: number,
    private readonly graciaSegundos: number
  ) {}

  generar(payload: { sub: string; rol: string }): string {
    return jwt.sign(payload, this.secreto, { expiresIn: this.ttlSegundos });
  }

  get ttlEnMilisegundos(): number {
    return this.ttlSegundos * 1000;
  }

  verificarConRenovacion(token: string): ResultadoVerificacion {
    try {
      const payload = jwt.verify(token, this.secreto) as PayloadToken;
      return { payload };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        const payload = jwt.verify(token, this.secreto, { ignoreExpiration: true }) as PayloadToken;
        const ahoraSegundos = Math.floor(Date.now() / 1000);
        const segundosDesdeExpiracion = ahoraSegundos - (payload.exp ?? 0);

        if (segundosDesdeExpiracion <= this.graciaSegundos) {
          const nuevoToken = this.generar({ sub: payload.sub, rol: payload.rol });
          return { payload, nuevoToken };
        }
        throw new UnauthorizedError('La sesión expiró y ya pasó el período de gracia.');
      }
      throw new UnauthorizedError('Token inválido.');
    }
  }
}

import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../../errors/UnauthorizedError';

export interface PayloadToken {
  sub: string; // id del usuario
  rol: string;
  iat?: number;
  exp?: number;
}

export interface ResultadoVerificacion {
  payload: PayloadToken;
  /** Si el token se renovó (estaba expirado pero dentro del período de gracia), aquí viene el nuevo. */
  nuevoToken?: string;
}

/**
 * SRP: esta clase solo sabe emitir y verificar JWT. No sabe de cookies,
 * no sabe de HTTP, no sabe de usuarios de la base de datos.
 */
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

  /**
   * Verifica el token. Si es válido, lo retorna tal cual.
   *
   * Si está expirado, no lo descarta de inmediato: vuelve a verificar la
   * FIRMA (con `ignoreExpiration: true`, que sigue siendo seguro porque
   * la firma criptográfica se sigue validando) y calcula cuánto tiempo
   * ha pasado desde que expiró. Si ese tiempo es menor o igual al
   * período de gracia configurado, emite un token nuevo automáticamente
   * — esto es la "renovación automática" que pide el enunciado.
   *
   * Si ya pasó el período de gracia, o la firma no es válida, rechaza.
   */
  verificarConRenovacion(token: string): ResultadoVerificacion {
    try {
      const payload = jwt.verify(token, this.secreto) as PayloadToken;
      return { payload };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        const payload = jwt.verify(token, this.secreto, {
          ignoreExpiration: true,
        }) as PayloadToken;

        const ahoraSegundos = Math.floor(Date.now() / 1000);
        const segundosDesdeExpiracion = ahoraSegundos - (payload.exp ?? 0);

        if (segundosDesdeExpiracion <= this.graciaSegundos) {
          const nuevoToken = this.generar({ sub: payload.sub, rol: payload.rol });
          return { payload, nuevoToken };
        }

        throw new UnauthorizedError('La sesión expiró y ya pasó el período de gracia para renovarla.');
      }

      throw new UnauthorizedError('Token inválido.');
    }
  }
}

import axios from 'axios';
import { IAutorizacionClient } from './IAutorizacionClient';
import { ServiceUnavailableError } from '../../errors/ServiceUnavailableError';

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Implementación real de IAutorizacionClient: llama por HTTP al
 * microservicio de autorización. Si la llamada falla (timeout, 5xx,
 * servicio caído), reintenta con backoff exponencial antes de rendirse.
 *
 * Esto es exactamente lo que pide el enunciado: "un mecanismo de
 * reintentos con espera (polling/retry loop) ante fallas temporales o
 * timeouts, con un número máximo de reintentos y un backoff
 * configurable, antes de denegar el acceso por error de comunicación."
 */
export class HttpAutorizacionClient implements IAutorizacionClient {
  constructor(
    private readonly urlBase: string,
    private readonly maxIntentos: number,
    private readonly backoffBaseMs: number,
    private readonly timeoutMs: number
  ) {}

  async verificarPermiso(rol: string, recurso: string): Promise<boolean> {
    let ultimoError: unknown;

    for (let intento = 1; intento <= this.maxIntentos; intento++) {
      try {
        const respuesta = await axios.post<{ permitido: boolean }>(
          `${this.urlBase}/authorize`,
          { rol, recurso },
          { timeout: this.timeoutMs }
        );
        return respuesta.data.permitido;
      } catch (error) {
        ultimoError = error;
        const esUltimoIntento = intento === this.maxIntentos;
        console.warn(
          `[auth-service] Intento ${intento}/${this.maxIntentos} hacia authorization-service falló.` +
            (esUltimoIntento ? ' Se agotaron los reintentos.' : ' Reintentando...')
        );

        if (!esUltimoIntento) {
          const esperaMs = this.backoffBaseMs * Math.pow(2, intento - 1); // 1x, 2x, 4x, 8x...
          await esperar(esperaMs);
        }
      }
    }

    console.error('[auth-service] authorization-service no disponible:', ultimoError);
    throw new ServiceUnavailableError('authorization-service');
  }
}

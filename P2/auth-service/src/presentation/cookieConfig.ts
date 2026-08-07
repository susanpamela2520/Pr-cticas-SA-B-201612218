import { CookieOptions } from 'express';

export const NOMBRE_COOKIE = 'access_token';

/**
 * Un solo lugar para las opciones de la cookie, para no repetirlas (y
 * arriesgarnos a que queden inconsistentes) en login, renovación y logout.
 *
 * - httpOnly: JavaScript del navegador NO puede leer esta cookie. Es la
 *   defensa principal contra robo de token vía XSS, y es justo lo que
 *   pide el enunciado ("el token no puede estar en ningún lugar visible
 *   por el usuario").
 * - sameSite 'lax': mitiga CSRF sin romper la navegación normal.
 * - secure: solo en producción (HTTPS). En local con http://localhost
 *   el navegador rechazaría una cookie "secure".
 */
export function opcionesCookie(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeMs,
    path: '/',
  };
}

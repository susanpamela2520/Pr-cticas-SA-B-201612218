import { CookieOptions } from 'express';

export const NOMBRE_COOKIE = 'access_token';

export function opcionesCookie(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeMs,
    path: '/',
  };
}

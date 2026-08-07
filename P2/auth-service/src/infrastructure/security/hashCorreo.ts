import crypto from 'crypto';

/**
 * Problema que resuelve este archivo: si el correo se guarda cifrado con
 * AES-GCM (que usa un IV aleatorio distinto cada vez), dos cifrados del
 * mismo correo NUNCA se ven iguales. Eso es bueno para confidencialidad,
 * pero imposibilita hacer `WHERE correo = ?` para el login.
 *
 * Solución estándar: además del correo cifrado (para mostrarlo), se
 * guarda un HMAC-SHA256 determinístico del correo (para buscarlo). El
 * HMAC no es reversible — no expone el correo — pero el mismo correo
 * siempre produce el mismo hash, así que sí sirve como índice de
 * búsqueda único.
 */
export function hashCorreo(correo: string, secreto: string): string {
  const normalizado = correo.trim().toLowerCase();
  return crypto.createHmac('sha256', secreto).update(normalizado).digest('hex');
}

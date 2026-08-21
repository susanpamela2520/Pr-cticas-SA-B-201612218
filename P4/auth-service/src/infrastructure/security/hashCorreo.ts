import crypto from 'crypto';

export function hashCorreo(correo: string, secreto: string): string {
  const normalizado = correo.trim().toLowerCase();
  return crypto.createHmac('sha256', secreto).update(normalizado).digest('hex');
}

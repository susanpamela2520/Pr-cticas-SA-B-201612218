import crypto from 'crypto';

const ALGORITMO = 'aes-256-gcm';

export class AesCipher {
  constructor(private readonly claveHex: string) {
    if (Buffer.from(claveHex, 'hex').length !== 32) {
      throw new Error('AES_KEY_HEX debe representar exactamente 32 bytes (64 caracteres hex).');
    }
  }

  encriptar(textoPlano: string): string {
    const iv = crypto.randomBytes(12);
    const clave = Buffer.from(this.claveHex, 'hex');
    const cipher = crypto.createCipheriv(ALGORITMO, clave, iv);
    const cifrado = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('hex'), authTag.toString('hex'), cifrado.toString('hex')].join(':');
  }

  desencriptar(valorCifrado: string): string {
    const [ivHex, authTagHex, cifradoHex] = valorCifrado.split(':');
    const clave = Buffer.from(this.claveHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITMO, clave, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(cifradoHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }
}

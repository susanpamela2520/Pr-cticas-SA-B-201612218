import express, { Application, Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Pool } from 'pg';
import { createHandler } from 'graphql-http/lib/use/express';
import { buildSchema } from 'graphql';

// ---------- Config ----------
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_TTL = Number(process.env.JWT_TTL_SEGUNDOS) || 900;
const JWT_GRACIA = Number(process.env.JWT_RENOVACION_GRACIA_SEGUNDOS) || 300;
const AES_KEY_HEX = process.env.AES_KEY_HEX || '0'.repeat(64);
const CORREO_HASH_SECRET = process.env.CORREO_HASH_SECRET || 'dev-hash-secret';
const NOMBRE_COOKIE = 'access_token';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'auth_db',
});

// ---------- Errores ----------
abstract class AppError extends Error {
  abstract readonly statusCode: number;
}
class ValidationError extends AppError {
  readonly statusCode = 400;
  constructor(public detalles: string[]) { super('Datos inválidos.'); }
}
class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  constructor(m = 'No autenticado.') { super(m); }
}
class ConflictError extends AppError {
  readonly statusCode = 409;
}

// ---------- AES-256-GCM ----------
function encriptar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const clave = Buffer.from(AES_KEY_HEX, 'hex');
  const cipher = crypto.createCipheriv('aes-256-gcm', clave, iv);
  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), cifrado.toString('hex')].join(':');
}
function desencriptar(valor: string): string {
  const [ivHex, tagHex, dataHex] = valor.split(':');
  const clave = Buffer.from(AES_KEY_HEX, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', clave, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}
function hashCorreo(correo: string): string {
  return crypto.createHmac('sha256', CORREO_HASH_SECRET).update(correo.trim().toLowerCase()).digest('hex');
}

// ---------- JWT con renovación automática ----------
function generarToken(payload: { sub: string; rol: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_TTL });
}
function verificarConRenovacion(token: string): { payload: any; nuevoToken?: string } {
  try {
    return { payload: jwt.verify(token, JWT_SECRET) };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      const payload: any = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
      const segundosDesdeExp = Math.floor(Date.now() / 1000) - (payload.exp ?? 0);
      if (segundosDesdeExp <= JWT_GRACIA) {
        return { payload, nuevoToken: generarToken({ sub: payload.sub, rol: payload.rol }) };
      }
      throw new UnauthorizedError('Sesión expirada.');
    }
    throw new UnauthorizedError('Token inválido.');
  }
}
function opcionesCookie(maxAgeMs: number) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', maxAge: maxAgeMs, path: '/' };
}

declare global {
  namespace Express { interface Request { usuario?: { id: string; rol: string } } }
}

function verificarToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[NOMBRE_COOKIE];
  if (!token) return next(new UnauthorizedError('No hay sesión activa.'));
  try {
    const { payload, nuevoToken } = verificarConRenovacion(token);
    req.usuario = { id: payload.sub, rol: payload.rol };
    if (nuevoToken) res.cookie(NOMBRE_COOKIE, nuevoToken, opcionesCookie(JWT_TTL * 1000));
    next();
  } catch (e) { next(e); }
}

async function obtenerPerfil(id: string) {
  const r = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
  if (!r.rows[0]) throw new UnauthorizedError('Usuario no encontrado.');
  const u = r.rows[0];
  return { id: u.id, nombre: desencriptar(u.nombre_cifrado), correo: desencriptar(u.correo_cifrado), rol: u.rol };
}

// ---------- GraphQL ----------
const schema = buildSchema(`
  type Usuario { id: ID!, nombre: String!, correo: String!, rol: String! }
  type Query { me: Usuario }
`);

// ---------- App ----------
export async function crearApp(): Promise<Application> {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE IF NOT EXISTS usuarios (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre_cifrado TEXT NOT NULL,
      correo_cifrado TEXT NOT NULL,
      contrasena_cifrada TEXT NOT NULL,
      correo_hash CHAR(64) NOT NULL UNIQUE,
      rol VARCHAR(20) NOT NULL CHECK (rol IN ('Cliente','Agente','Admin')),
      creado_en TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ status: 'ok', servicio: 'auth-service' }));

  app.post('/api/auth/registro', async (req, res, next) => {
    try {
      const { nombre, correo, contrasena, rol } = req.body ?? {};
      const errores: string[] = [];
      if (typeof nombre !== 'string' || nombre.trim().length < 2) errores.push('nombre inválido');
      if (typeof correo !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) errores.push('correo inválido');
      if (typeof contrasena !== 'string' || contrasena.length < 8) errores.push('contrasena debe tener 8+ caracteres');
      const rolesValidos = ['Cliente', 'Agente', 'Admin'];
      const rolFinal = rol && rolesValidos.includes(rol) ? rol : 'Cliente';
      if (errores.length) throw new ValidationError(errores);

      const correoHash = hashCorreo(correo);
      const existe = await pool.query('SELECT id FROM usuarios WHERE correo_hash = $1', [correoHash]);
      if (existe.rows[0]) throw new ConflictError('Correo ya registrado.');

      const r = await pool.query(
        `INSERT INTO usuarios (nombre_cifrado, correo_cifrado, correo_hash, contrasena_cifrada, rol)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, rol`,
        [encriptar(nombre), encriptar(correo), correoHash, encriptar(contrasena), rolFinal]
      );
      res.status(201).json({ id: r.rows[0].id, nombre, correo, rol: r.rows[0].rol });
    } catch (e) { next(e); }
  });

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const { correo, contrasena } = req.body ?? {};
      if (typeof correo !== 'string' || typeof contrasena !== 'string') {
        throw new ValidationError(['correo y contrasena son requeridos']);
      }
      const r = await pool.query('SELECT * FROM usuarios WHERE correo_hash = $1', [hashCorreo(correo)]);
      if (!r.rows[0]) throw new UnauthorizedError('Correo o contraseña incorrectos.');
      const u = r.rows[0];
      if (desencriptar(u.contrasena_cifrada) !== contrasena) throw new UnauthorizedError('Correo o contraseña incorrectos.');

      const token = generarToken({ sub: u.id, rol: u.rol });
      res.cookie(NOMBRE_COOKIE, token, opcionesCookie(JWT_TTL * 1000));
      res.status(200).json({ id: u.id, nombre: desencriptar(u.nombre_cifrado), correo: desencriptar(u.correo_cifrado), rol: u.rol });
    } catch (e) { next(e); }
  });

  app.get('/api/auth/me', verificarToken, async (req, res, next) => {
    try { res.json(await obtenerPerfil(req.usuario!.id)); } catch (e) { next(e); }
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(NOMBRE_COOKIE, { path: '/' });
    res.status(204).send();
  });

  app.use('/graphql', (req, res, next) => {
    if (!req.cookies?.[NOMBRE_COOKIE]) return next();
    verificarToken(req, res, next);
  });
  app.all(
    '/graphql',
    (req, _res, next) => { (req as any).raw = req; next(); },
    createHandler({
      schema,
      context: (req: any) => ({ usuario: req.raw.usuario }),
      rootValue: {
        me: async (_a: unknown, ctx: { usuario?: { id: string } }) => {
          if (!ctx.usuario) throw new Error('No autenticado.');
          return obtenerPerfil(ctx.usuario.id);
        },
      },
    }) as any
  );

  app.use((req, res) => res.status(404).json({ error: `Ruta ${req.method} ${req.originalUrl} no existe.` }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ValidationError) return void res.status(err.statusCode).json({ error: err.message, detalles: err.detalles });
    if (err instanceof SyntaxError && 'body' in (err as any)) return void res.status(400).json({ error: 'JSON inválido.' });
    if (err instanceof AppError) return void res.status(err.statusCode).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  return app;
}

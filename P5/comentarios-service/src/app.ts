import express, { Application, Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'comentarios_db',
});

declare global {
  namespace Express { interface Request { usuario?: { id: string; rol: string } } }
}

function verificarToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.access_token;
  if (!token) { res.status(401).json({ error: 'No hay sesión activa.' }); return; }
  try {
    const payload: any = jwt.verify(token, JWT_SECRET);
    req.usuario = { id: payload.sub, rol: payload.rol };
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

export async function crearApp(): Promise<Application> {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE IF NOT EXISTS comentarios (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id UUID NOT NULL,
      autor_id UUID NOT NULL,
      autor_rol VARCHAR(20) NOT NULL,
      mensaje TEXT NOT NULL,
      creado_en TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ status: 'ok', servicio: 'comentarios-service' }));

  app.post('/comentarios', verificarToken, async (req, res, next) => {
    try {
      const { ticket_id, mensaje } = req.body ?? {};
      if (typeof ticket_id !== 'string' || typeof mensaje !== 'string' || !mensaje.trim()) {
        res.status(400).json({ error: 'ticket_id y mensaje son requeridos.' });
        return;
      }
      const r = await pool.query(
        `INSERT INTO comentarios (ticket_id, autor_id, autor_rol, mensaje) VALUES ($1,$2,$3,$4) RETURNING *`,
        [ticket_id, req.usuario!.id, req.usuario!.rol, mensaje]
      );
      res.status(201).json(r.rows[0]);
    } catch (e) { next(e); }
  });

  app.get('/comentarios', verificarToken, async (req, res, next) => {
    try {
      const ticketId = req.query.ticket_id;
      if (typeof ticketId !== 'string') { res.status(400).json({ error: 'ticket_id requerido.' }); return; }
      const r = await pool.query('SELECT * FROM comentarios WHERE ticket_id = $1 ORDER BY creado_en ASC', [ticketId]);
      res.json(r.rows);
    } catch (e) { next(e); }
  });

  app.use((req, res) => res.status(404).json({ error: `Ruta ${req.method} ${req.originalUrl} no existe.` }));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  return app;
}

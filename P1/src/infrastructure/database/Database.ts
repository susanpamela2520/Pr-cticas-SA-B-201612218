import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Punto único de acceso al pool de conexiones de PostgreSQL.
 * SRP: esta clase solo se encarga de crear/entregar la conexión;
 * no contiene ninguna consulta SQL de negocio.
 */
export class Database {
  private static pool: Pool | undefined;

  public static getPool(): Pool {
    if (!Database.pool) {
      Database.pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'academia_db',
      });
    }
    return Database.pool;
  }
}

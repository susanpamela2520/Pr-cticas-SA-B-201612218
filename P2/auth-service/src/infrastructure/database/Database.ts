import { Pool } from 'pg';

export class Database {
  private static pool: Pool | undefined;

  public static getPool(): Pool {
    if (!Database.pool) {
      Database.pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5433,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'auth_db',
      });
    }
    return Database.pool;
  }
}

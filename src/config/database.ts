import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Helper para queries simples
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

// Helper para query que devuelve una sola fila
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const result = await pool.query(text, params);
  return (result.rows[0] as T) ?? null;
}

// Helper para query con count
export async function queryWithCount<T = any>(
  text: string,
  countText: string,
  params?: any[]
): Promise<{ data: T[]; count: number }> {
  const [dataResult, countResult] = await Promise.all([
    pool.query(text, params),
    pool.query(countText, params),
  ]);
  return {
    data: dataResult.rows as T[],
    count: parseInt(countResult.rows[0]?.count ?? '0'),
  };
}

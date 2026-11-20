import pg from 'pg';
import { env } from '../config.js';

const { Pool } = pg;

export const dbPool = new Pool({
  connectionString: env.DATABASE_URL,
});

export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const client = await dbPool.connect();
    try {
      await client.query('SELECT 1');
      return { healthy: true, latencyMs: Date.now() - start };
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown database error';
    return { healthy: false, error: message };
  }
}

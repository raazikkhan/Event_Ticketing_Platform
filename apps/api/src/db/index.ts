import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { env } from '../config.js';
import * as schema from './schema.js';

const { Pool } = pg;

export const dbPool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle(dbPool, { schema });

export async function initDb(): Promise<void> {
  await dbPool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../migrations', import.meta.url)),
  });
}

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

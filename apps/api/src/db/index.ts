import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config.js';
import * as schema from './schema.js';

const { Pool } = pg;

export const dbPool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle(dbPool, { schema });

export async function initDb(): Promise<void> {
  const client = await dbPool.connect();
  try {
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    `);
  } finally {
    client.release();
  }
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

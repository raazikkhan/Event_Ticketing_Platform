import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { type User, sessions, users } from '../db/schema.js';

const SALT_ROUNDS = 10;
const SESSION_DURATION_DAYS = 7;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

  await db.insert(sessions).values({
    userId,
    token,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function getUserBySessionToken(token: string): Promise<User | null> {
  const now = new Date();
  const result = await db
    .select({
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  return result[0].user;
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}

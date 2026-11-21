import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { env } from '../config.js';
import { db } from '../db/index.js';
import { events } from '../db/schema.js';
import { redis } from '../redis/index.js';

export interface QueueStatus {
  eventId: string;
  admitted: boolean;
  position: number | null;
  admittedCount: number;
  estimatedWaitSeconds: number;
  admissionToken: string | null;
}

function queueKey(eventId: string): string {
  return `waiting-room:${eventId}:queue`;
}

function admittedKey(eventId: string): string {
  return `waiting-room:${eventId}:admitted`;
}

function tokenKey(eventId: string, userId: string): string {
  return `waiting-room:${eventId}:token:${userId}`;
}

function signAdmissionPayload(payload: string): string {
  return crypto.createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url');
}

export async function isHighDemandEvent(eventId: string): Promise<boolean> {
  const [event] = await db
    .select({ isHighDemand: events.isHighDemand })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  return event?.isHighDemand ?? false;
}

export async function joinWaitingRoom(eventId: string, userId: string): Promise<QueueStatus> {
  const existingToken = await redis.get(tokenKey(eventId, userId));
  if (existingToken) {
    return {
      eventId,
      admitted: true,
      position: null,
      admittedCount: await redis.scard(admittedKey(eventId)),
      estimatedWaitSeconds: 0,
      admissionToken: existingToken,
    };
  }

  await redis.zadd(queueKey(eventId), 'NX', Date.now(), userId);
  await admitWaitingRoomBatch(eventId);

  const score = await redis.zscore(queueKey(eventId), userId);
  const admitted = (await redis.sismember(admittedKey(eventId), userId)) === 1;
  const admittedCount = await redis.scard(admittedKey(eventId));

  if (admitted) {
    const token = issueAdmissionToken(eventId, userId);
    await redis.set(
      tokenKey(eventId, userId),
      token,
      'PX',
      env.WAITING_ROOM_ADMISSION_SECONDS * 1000,
    );
    await redis.zrem(queueKey(eventId), userId);
  }

  let position: number | null = null;
  let estimatedWaitSeconds = 0;
  if (!admitted && score) {
    position = (await redis.zrank(queueKey(eventId), userId)) ?? null;
    estimatedWaitSeconds =
      position === null ? 0 : Math.ceil((position / env.WAITING_ROOM_BATCH_SIZE) * 30);
  }

  return {
    eventId,
    admitted,
    position: admitted ? null : position === null ? null : position + 1,
    admittedCount,
    estimatedWaitSeconds,
    admissionToken: admitted ? await redis.get(tokenKey(eventId, userId)) : null,
  };
}

export async function admitWaitingRoomBatch(eventId: string): Promise<number> {
  const admittedCount = await redis.scard(admittedKey(eventId));
  if (admittedCount >= env.WAITING_ROOM_BATCH_SIZE) return admittedCount;

  const availableSlots = env.WAITING_ROOM_BATCH_SIZE - admittedCount;
  const admittedUsers = await redis.zpopmin(queueKey(eventId), availableSlots);
  for (let index = 0; index < admittedUsers.length; index += 2) {
    const userId = admittedUsers[index];
    await redis.sadd(admittedKey(eventId), userId);
  }
  await redis.expire(admittedKey(eventId), env.WAITING_ROOM_ADMISSION_SECONDS);
  return redis.scard(admittedKey(eventId));
}

function issueAdmissionToken(eventId: string, userId: string): string {
  const expiresAt = Date.now() + env.WAITING_ROOM_ADMISSION_SECONDS * 1000;
  const payload = `${eventId}.${userId}.${expiresAt}`;
  return `${payload}.${signAdmissionPayload(payload)}`;
}

export function verifyAdmissionToken(eventId: string, userId: string, token: string): boolean {
  const separator = token.lastIndexOf('.');
  if (separator < 0) return false;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const parts = payload.split('.');
  if (parts.length !== 3) return false;
  if (parts[0] !== eventId || parts[1] !== userId) return false;
  const expiresAt = Number(parts[2]);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

  const expected = signAdmissionPayload(payload);
  const provided = Buffer.from(signature);
  const calculated = Buffer.from(expected);
  return provided.length === calculated.length && crypto.timingSafeEqual(provided, calculated);
}

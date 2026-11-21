import { Redis } from 'ioredis';
import { env } from '../config.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 5) return null;
    return Math.min(times * 100, 2000);
  },
  lazyConnect: true,
});

export const redisPubSub = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

export function seatUpdateChannel(eventId: string): string {
  return `seat-updates:${eventId}`;
}

export async function publishSeatUpdate(
  eventId: string,
  status: 'held' | 'released' | 'sold',
  seatIds: string[],
): Promise<void> {
  await redis.publish(
    seatUpdateChannel(eventId),
    JSON.stringify({ eventId, status, seatIds, timestamp: new Date().toISOString() }),
  );
}

export async function checkRedisHealth(): Promise<{
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    if (redis.status !== 'ready' && redis.status !== 'connecting') {
      await redis.connect();
    }
    const pong = await redis.ping();
    return {
      healthy: pong === 'PONG',
      latencyMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown redis error';
    return { healthy: false, error: message };
  }
}

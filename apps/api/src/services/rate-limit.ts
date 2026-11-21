import crypto from 'node:crypto';
import { env } from '../config.js';
import { redis } from '../redis/index.js';

export async function checkSlidingWindowRateLimit(
  key: string,
  limit: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = Date.now();
  const windowStart = now - env.RATE_LIMIT_WINDOW_SECONDS * 1000;
  const redisKey = `rate-limit:${key}`;

  await redis.zremrangebyscore(redisKey, 0, windowStart);
  await redis.zadd(redisKey, now, `${now}:${crypto.randomUUID()}`);
  const count = await redis.zcard(redisKey);
  await redis.expire(redisKey, env.RATE_LIMIT_WINDOW_SECONDS);

  if (count <= limit) return { allowed: true, retryAfterSeconds: 0 };
  return { allowed: false, retryAfterSeconds: env.RATE_LIMIT_WINDOW_SECONDS };
}

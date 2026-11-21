import crypto from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { confirmedSeats, seats } from '../db/schema.js';
import { redis } from '../redis/index.js';

export const HOLD_TTL_MS = 5 * 60 * 1000;
export const MAX_SEATS_PER_HOLD = 8;
export const MAX_CONCURRENT_HOLDS_PER_USER = 10;

const HOLD_SCRIPT = `
local holdKey = KEYS[1]
local userKey = KEYS[2]
local holdId = ARGV[1]
local ttl = ARGV[2]
local seatCount = tonumber(ARGV[3])
local ownerId = ARGV[4]

for i = 1, seatCount do
  local seatKey = KEYS[2 + i]
  if redis.call("EXISTS", seatKey) == 1 then
    return 0
  end
end

redis.call("SET", holdKey, ownerId .. ":" .. holdId, "PX", ttl)
for i = 1, seatCount do
  local seatKey = KEYS[2 + i]
  redis.call("SET", seatKey, holdId, "PX", ttl)
end
redis.call("SADD", userKey, holdId)
redis.call("PEXPIRE", userKey, ttl)
return 1
`;

const RELEASE_SCRIPT = `
local holdKey = KEYS[1]
local userKey = KEYS[2]
local holdId = ARGV[1]
local ownerId = ARGV[2]
local seatCount = tonumber(ARGV[3])

local record = redis.call("GET", holdKey)
if not record or record ~= ownerId .. ":" .. holdId then
  return 0
end

for i = 1, seatCount do
  local seatKey = KEYS[2 + i]
  if redis.call("GET", seatKey) == holdId then
    redis.call("DEL", seatKey)
  end
end
redis.call("DEL", holdKey)
redis.call("SREM", userKey, holdId)
return 1
`;

export interface SeatHold {
  id: string;
  eventId: string;
  ownerId: string;
  seatIds: string[];
  expiresAt: string;
}

function seatHoldKey(eventId: string, seatId: string): string {
  return `seat-hold:${eventId}:${seatId}`;
}

function holdRecordKey(eventId: string, holdId: string): string {
  return `hold:${eventId}:${holdId}`;
}

function userHoldSetKey(ownerId: string, eventId: string): string {
  return `hold-user:${eventId}:${ownerId}`;
}

export async function createSeatHold(
  eventId: string,
  ownerId: string,
  seatIds: string[],
): Promise<{ hold: SeatHold | null; reason?: 'invalid_seats' | 'sold' | 'held' | 'limit' }> {
  if (seatIds.length === 0 || seatIds.length > MAX_SEATS_PER_HOLD) {
    return { hold: null, reason: 'limit' };
  }

  const uniqueSeatIds = Array.from(new Set(seatIds));
  if (uniqueSeatIds.length !== seatIds.length) {
    return { hold: null, reason: 'invalid_seats' };
  }

  const eventSeats = await db
    .select({ id: seats.id })
    .from(seats)
    .where(and(eq(seats.eventId, eventId), inArray(seats.id, uniqueSeatIds)));

  if (eventSeats.length !== uniqueSeatIds.length) {
    return { hold: null, reason: 'invalid_seats' };
  }

  const soldSeats = await db
    .select({ seatId: confirmedSeats.seatId })
    .from(confirmedSeats)
    .where(and(eq(confirmedSeats.eventId, eventId), inArray(confirmedSeats.seatId, uniqueSeatIds)));
  if (soldSeats.length > 0) {
    return { hold: null, reason: 'sold' };
  }

  const userKey = userHoldSetKey(ownerId, eventId);
  const holdIds = await redis.smembers(userKey);
  const liveHoldIds: string[] = [];
  for (const holdId of holdIds) {
    if (await redis.exists(holdRecordKey(eventId, holdId))) liveHoldIds.push(holdId);
  }
  if (liveHoldIds.length >= MAX_CONCURRENT_HOLDS_PER_USER) {
    return { hold: null, reason: 'limit' };
  }
  if (liveHoldIds.length > 0) {
    await redis.srem(userKey, ...holdIds.filter((holdId) => !liveHoldIds.includes(holdId)));
  }

  const holdId = crypto.randomUUID();
  const holdKey = holdRecordKey(eventId, holdId);
  const seatKeys = uniqueSeatIds.map((seatId) => seatHoldKey(eventId, seatId));

  const acquired = await redis.eval(
    HOLD_SCRIPT,
    2 + seatKeys.length,
    holdKey,
    userKey,
    ...seatKeys,
    holdId,
    HOLD_TTL_MS,
    uniqueSeatIds.length,
    ownerId,
  );

  if (acquired !== 1) {
    return { hold: null, reason: 'held' };
  }

  const expiresAt = new Date(Date.now() + HOLD_TTL_MS).toISOString();
  return {
    hold: {
      id: holdId,
      eventId,
      ownerId,
      seatIds: uniqueSeatIds,
      expiresAt,
    },
  };
}

export async function releaseSeatHold(
  eventId: string,
  ownerId: string,
  holdId: string,
): Promise<boolean> {
  const holdKey = holdRecordKey(eventId, holdId);
  const record = await redis.get(holdKey);
  if (!record || record !== `${ownerId}:${holdId}`) return false;

  const holdIds = await redis.keys(`hold:${eventId}:${holdId}`);
  if (holdIds.length === 0) return false;

  const seatKeys = await redis.keys(`seat-hold:${eventId}:*`);
  const ownedSeatKeys: string[] = [];
  for (const seatKey of seatKeys) {
    if ((await redis.get(seatKey)) === holdId) ownedSeatKeys.push(seatKey);
  }

  const released = await redis.eval(
    RELEASE_SCRIPT,
    2 + ownedSeatKeys.length,
    holdKey,
    userHoldSetKey(ownerId, eventId),
    ...ownedSeatKeys,
    holdId,
    ownerId,
    ownedSeatKeys.length,
  );

  return released === 1;
}

export async function getHeldSeatIds(eventId: string): Promise<string[]> {
  const prefix = `seat-hold:${eventId}:`;
  const keys = await redis.keys(`${prefix}*`);
  return keys.map((key) => key.slice(prefix.length));
}

export async function getSeatHold(
  eventId: string,
  ownerId: string,
  holdId: string,
): Promise<SeatHold | null> {
  const holdKey = holdRecordKey(eventId, holdId);
  const record = await redis.get(holdKey);
  if (!record || record !== `${ownerId}:${holdId}`) return null;

  const ttl = await redis.pttl(holdKey);
  if (ttl <= 0) return null;

  const seatIds: string[] = [];
  const keys = await redis.keys(`seat-hold:${eventId}:*`);
  for (const key of keys) {
    if ((await redis.get(key)) === holdId) seatIds.push(key.slice(`seat-hold:${eventId}:`.length));
  }

  return {
    id: holdId,
    eventId,
    ownerId,
    seatIds,
    expiresAt: new Date(Date.now() + ttl).toISOString(),
  };
}

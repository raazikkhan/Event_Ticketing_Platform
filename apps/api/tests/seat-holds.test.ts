import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { dbPool, initDb } from '../src/db/index.js';
import { redis, redisPubSub, seatUpdateChannel } from '../src/redis/index.js';
import { createSeatHold, getHeldSeatIds, releaseSeatHold } from '../src/services/seat-hold.js';

describe('Seat Holds', () => {
  let eventId: string;
  let sectionId: string;
  let seatIds: string[];
  let organizerId: string;

  beforeAll(async () => {
    await initDb();
    organizerId = randomUUID();
    eventId = randomUUID();
    sectionId = randomUUID();
    seatIds = [randomUUID(), randomUUID(), randomUUID()];
    const suffix = randomUUID();

    await dbPool.query(
      `INSERT INTO users (id, email, password_hash, name, role)
       VALUES ($1, $2, 'test_hash', 'Hold Organizer', 'organizer')`,
      [organizerId, `hold_org_${suffix}@example.com`],
    );
    await dbPool.query(
      `INSERT INTO events (id, organizer_id, title, description, venue_name, venue_address, event_date)
       VALUES ($1, $2, 'Hold Test', 'Seat hold verification', 'Test Venue', 'Test Address', now() + interval '30 days')`,
      [eventId, organizerId],
    );
    await dbPool.query(
      `INSERT INTO sections (id, event_id, name, price, rows_count, seats_per_row)
       VALUES ($1, $2, 'Test', 1000, 1, 3)`,
      [sectionId, eventId],
    );

    for (let index = 0; index < seatIds.length; index++) {
      await dbPool.query(
        `INSERT INTO seats (id, event_id, section_id, row_label, seat_number, seat_label)
         VALUES ($1, $2, $3, 'A', $4, $5)`,
        [seatIds[index], eventId, sectionId, index + 1, `Test-A-${index + 1}`],
      );
    }
  });

  it('allows exactly one concurrent owner to hold the same seat', async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();

    const results = await Promise.all([
      createSeatHold(eventId, ownerA, [seatIds[0]]),
      createSeatHold(eventId, ownerB, [seatIds[0]]),
    ]);

    expect(results.filter((result) => result.hold !== null)).toHaveLength(1);
    expect(results.filter((result) => result.reason === 'held')).toHaveLength(1);

    const winner = results.find((result) => result.hold !== null)?.hold;
    expect(winner).toBeDefined();
    if (winner) {
      expect(await releaseSeatHold(eventId, winner.ownerId, winner.id)).toBe(true);
    }
  });

  it('rolls back a multi-seat hold when any seat is already held', async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();

    const first = await createSeatHold(eventId, ownerA, [seatIds[1]]);
    expect(first.hold).not.toBeNull();

    const second = await createSeatHold(eventId, ownerB, [seatIds[1], seatIds[2]]);
    expect(second.hold).toBeNull();
    expect(second.reason).toBe('held');

    expect(await getHeldSeatIds(eventId)).not.toContain(seatIds[2]);
    if (first.hold) {
      expect(await releaseSeatHold(eventId, randomUUID(), first.hold.id)).toBe(false);
      expect(await releaseSeatHold(eventId, ownerA, first.hold.id)).toBe(true);
    }
  });

  it('rejects invalid seats and sold seats', async () => {
    const invalid = await createSeatHold(eventId, randomUUID(), [randomUUID()]);
    expect(invalid.reason).toBe('invalid_seats');

    const attendeeId = randomUUID();
    await dbPool.query(
      `INSERT INTO users (id, email, password_hash, name, role)
       VALUES ($1, $2, 'test_hash', 'Sold Attendee', 'attendee')`,
      [attendeeId, `sold_${randomUUID()}@example.com`],
    );
    const bookingId = randomUUID();
    await dbPool.query(
      `INSERT INTO bookings (id, user_id, event_id, total_amount, status)
       VALUES ($1, $2, $3, 1000, 'confirmed')`,
      [bookingId, attendeeId, eventId],
    );
    await dbPool.query(
      `INSERT INTO confirmed_seats (event_id, seat_id, booking_id, price)
       VALUES ($1, $2, $3, 1000)`,
      [eventId, seatIds[2], bookingId],
    );

    const sold = await createSeatHold(eventId, randomUUID(), [seatIds[2]]);
    expect(sold.reason).toBe('sold');
  });

  it('stores a five-minute TTL on held seats', async () => {
    const ownerId = randomUUID();
    const result = await createSeatHold(eventId, ownerId, [seatIds[0]]);
    expect(result.hold).not.toBeNull();
    if (!result.hold) return;

    const ttl = await redis.pttl(`seat-hold:${eventId}:${seatIds[0]}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5 * 60 * 1000);
    expect(await releaseSeatHold(eventId, ownerId, result.hold.id)).toBe(true);
  });

  it('exposes availability merged from confirmed seats and Redis holds', async () => {
    const app = buildApp();
    const ownerId = randomUUID();
    const held = await createSeatHold(eventId, ownerId, [seatIds[0]]);
    expect(held.hold).not.toBeNull();

    const response = await app.inject({
      method: 'GET',
      url: `/api/events/${eventId}/availability`,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    const heldSeat = body.seats.find((seat: { id: string }) => seat.id === seatIds[0]);
    const soldSeat = body.seats.find((seat: { id: string }) => seat.id === seatIds[2]);
    expect(heldSeat.status).toBe('held');
    expect(soldSeat.status).toBe('sold');

    if (held.hold) {
      expect(await releaseSeatHold(eventId, ownerId, held.hold.id)).toBe(true);
    }
  });

  it('publishes held and released seat updates through Redis pub/sub', async () => {
    const subscriber = redisPubSub.duplicate();
    await subscriber.connect();
    await subscriber.subscribe(seatUpdateChannel(eventId));

    const messages: Array<{ status: string; seatIds: string[] }> = [];
    subscriber.on('message', (_channel, message) => {
      messages.push(JSON.parse(message));
    });

    const ownerId = randomUUID();
    const hold = await createSeatHold(eventId, ownerId, [seatIds[1]]);
    expect(hold.hold).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));

    if (hold.hold) {
      expect(await releaseSeatHold(eventId, ownerId, hold.hold.id)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(messages.map((message) => message.status)).toEqual(
      expect.arrayContaining(['held', 'released']),
    );
    expect(messages.find((message) => message.status === 'held')?.seatIds).toContain(seatIds[1]);
    await subscriber.unsubscribe(seatUpdateChannel(eventId));
    await subscriber.quit();
  });
});

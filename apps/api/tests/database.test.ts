import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { dbPool, initDb } from '../src/db/index.js';

describe('Database Modeling', () => {
  beforeAll(async () => {
    await initDb();
  });

  it('rejects duplicate confirmed seats for the same event with unique violation', async () => {
    const organizerId = randomUUID();
    const attendeeId = randomUUID();
    const eventId = randomUUID();
    const sectionId = randomUUID();
    const seatId = randomUUID();
    const firstBookingId = randomUUID();
    const secondBookingId = randomUUID();
    const suffix = randomUUID();

    await dbPool.query(
      `INSERT INTO users (id, email, password_hash, name, role)
       VALUES ($1, $2, 'test_hash', 'Database Organizer', 'organizer'),
              ($3, $4, 'test_hash', 'Database Attendee', 'attendee')`,
      [
        organizerId,
        `organizer_${suffix}@example.com`,
        attendeeId,
        `attendee_${suffix}@example.com`,
      ],
    );

    await dbPool.query(
      `INSERT INTO events (id, organizer_id, title, description, venue_name, venue_address, event_date)
       VALUES ($1, $2, 'Constraint Test', 'Database constraint verification', 'Test Venue', 'Test Address', now() + interval '30 days')`,
      [eventId, organizerId],
    );

    await dbPool.query(
      `INSERT INTO sections (id, event_id, name, price, rows_count, seats_per_row)
       VALUES ($1, $2, 'Test Section', 1000, 1, 1)`,
      [sectionId, eventId],
    );

    await dbPool.query(
      `INSERT INTO seats (id, event_id, section_id, row_label, seat_number, seat_label)
       VALUES ($1, $2, $3, 'A', 1, 'Test Section-A-1')`,
      [seatId, eventId, sectionId],
    );

    await dbPool.query(
      `INSERT INTO bookings (id, user_id, event_id, total_amount, status)
       VALUES ($1, $2, $3, 1000, 'confirmed'),
              ($4, $2, $3, 1000, 'confirmed')`,
      [firstBookingId, attendeeId, eventId, secondBookingId],
    );

    await dbPool.query(
      `INSERT INTO confirmed_seats (event_id, seat_id, booking_id, price)
       VALUES ($1, $2, $3, 1000)`,
      [eventId, seatId, firstBookingId],
    );

    await expect(
      dbPool.query(
        `INSERT INTO confirmed_seats (event_id, seat_id, booking_id, price)
         VALUES ($1, $2, $3, 1000)`,
        [eventId, seatId, secondBookingId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
});

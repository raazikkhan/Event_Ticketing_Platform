import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config.js';
import { dbPool, initDb } from '../src/db/index.js';

describe('Tickets, Scanner, and Refunds', () => {
  const app = buildApp();
  let organizerCookie = '';
  let attendeeCookie = '';
  let organizerId = '';
  let attendeeId = '';
  let eventId = '';
  let seatId = '';
  let sectionId = '';
  let confirmedBookingId = '';
  let lateBookingId = '';
  let ticketCode = '';

  beforeAll(async () => {
    await initDb();

    const organizer = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Scanner Organizer',
        email: `scanner_${randomUUID()}@example.com`,
        password: 'ScannerPassword123',
        role: 'organizer',
      },
    });
    const organizerCookies = organizer.headers['set-cookie'];
    organizerCookie = (
      Array.isArray(organizerCookies) ? organizerCookies[0] : (organizerCookies ?? '')
    ).split(';')[0];
    organizerId = JSON.parse(organizer.payload).user.id;

    const attendee = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Ticket Attendee',
        email: `ticket_${randomUUID()}@example.com`,
        password: 'TicketPassword123',
        role: 'attendee',
      },
    });
    const attendeeCookies = attendee.headers['set-cookie'];
    attendeeCookie = (
      Array.isArray(attendeeCookies) ? attendeeCookies[0] : (attendeeCookies ?? '')
    ).split(';')[0];
    attendeeId = JSON.parse(attendee.payload).user.id;

    eventId = randomUUID();
    sectionId = randomUUID();
    seatId = randomUUID();
    await dbPool.query(
      `INSERT INTO events (id, organizer_id, title, description, venue_name, venue_address, event_date)
       VALUES ($1, $2, 'Ticket Lifecycle', 'Ticket test event', 'Test Venue', 'Test Address', now() + interval '30 days')`,
      [eventId, organizerId],
    );
    await dbPool.query(
      `INSERT INTO sections (id, event_id, name, price, rows_count, seats_per_row)
       VALUES ($1, $2, 'Test', 3000, 1, 2)`,
      [sectionId, eventId],
    );
    await dbPool.query(
      `INSERT INTO seats (id, event_id, section_id, row_label, seat_number, seat_label)
       VALUES ($1, $2, $3, 'A', 1, 'Test-A-1')`,
      [seatId, eventId, sectionId],
    );

    confirmedBookingId = randomUUID();
    await dbPool.query(
      `INSERT INTO bookings (id, user_id, event_id, total_amount, status)
       VALUES ($1, $2, $3, 3000, 'confirmed')`,
      [confirmedBookingId, attendeeId, eventId],
    );
    await dbPool.query(
      `INSERT INTO confirmed_seats (event_id, seat_id, booking_id, price)
       VALUES ($1, $2, $3, 3000)`,
      [eventId, seatId, confirmedBookingId],
    );

    const payload = `${confirmedBookingId}:${eventId}:${seatId}:${attendeeId}`;
    const signature = crypto
      .createHmac('sha256', env.TICKET_SIGNING_SECRET)
      .update(payload)
      .digest('hex');
    ticketCode = `${payload}.${signature}`;
    await dbPool.query(
      `INSERT INTO tickets (booking_id, seat_id, event_id, user_id, ticket_code, status)
       VALUES ($1, $2, $3, $4, $5, 'issued')`,
      [confirmedBookingId, seatId, eventId, attendeeId, ticketCode],
    );
  });

  it('accepts a signed QR ticket once and rejects replay', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/organizer/tickets/scan',
      headers: { cookie: organizerCookie },
      payload: { ticketCode },
    });
    expect(first.statusCode).toBe(200);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/organizer/tickets/scan',
      headers: { cookie: organizerCookie },
      payload: { ticketCode },
    });
    expect(replay.statusCode).toBe(409);
  });

  it('rejects a tampered ticket signature', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/organizer/tickets/scan',
      headers: { cookie: organizerCookie },
      payload: { ticketCode: `${ticketCode.slice(0, -1)}0` },
    });
    expect(response.statusCode).toBe(404);
  });

  it('refunds a confirmed booking more than 24 hours before the event', async () => {
    const secondSeatId = randomUUID();
    await dbPool.query(
      `INSERT INTO seats (id, event_id, section_id, row_label, seat_number, seat_label)
       VALUES ($1, $2, $3, 'A', 2, 'Test-A-2')`,
      [secondSeatId, eventId, sectionId],
    );
    const bookingId = randomUUID();
    await dbPool.query(
      `INSERT INTO bookings (id, user_id, event_id, total_amount, status)
       VALUES ($1, $2, $3, 3000, 'confirmed')`,
      [bookingId, attendeeId, eventId],
    );
    await dbPool.query(
      `INSERT INTO confirmed_seats (event_id, seat_id, booking_id, price)
       VALUES ($1, $2, $3, 3000)`,
      [eventId, secondSeatId, bookingId],
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/bookings/${bookingId}/refund`,
      headers: { cookie: attendeeCookie },
    });
    expect(response.statusCode).toBe(200);

    const confirmed = await dbPool.query(
      'SELECT COUNT(*)::int AS count FROM confirmed_seats WHERE booking_id = $1',
      [bookingId],
    );
    expect(confirmed.rows[0].count).toBe(0);
  });

  it('rejects a refund less than 24 hours before the event', async () => {
    const lateSeatId = randomUUID();
    const lateEventId = randomUUID();
    const lateSectionId = randomUUID();
    await dbPool.query(
      `INSERT INTO events (id, organizer_id, title, description, venue_name, venue_address, event_date)
       VALUES ($1, $2, 'Late Refund', 'Late refund test', 'Test Venue', 'Test Address', now() + interval '12 hours')`,
      [lateEventId, organizerId],
    );
    await dbPool.query(
      `INSERT INTO sections (id, event_id, name, price, rows_count, seats_per_row)
       VALUES ($1, $2, 'Test', 3000, 1, 1)`,
      [lateSectionId, lateEventId],
    );
    await dbPool.query(
      `INSERT INTO seats (id, event_id, section_id, row_label, seat_number, seat_label)
       VALUES ($1, $2, $3, 'A', 1, 'Late-A-1')`,
      [lateSeatId, lateEventId, lateSectionId],
    );
    lateBookingId = randomUUID();
    await dbPool.query(
      `INSERT INTO bookings (id, user_id, event_id, total_amount, status)
       VALUES ($1, $2, $3, 3000, 'confirmed')`,
      [lateBookingId, attendeeId, lateEventId],
    );
    await dbPool.query(
      `INSERT INTO confirmed_seats (event_id, seat_id, booking_id, price)
       VALUES ($1, $2, $3, 3000)`,
      [lateEventId, lateSeatId, lateBookingId],
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/bookings/${lateBookingId}/refund`,
      headers: { cookie: attendeeCookie },
    });
    expect(response.statusCode).toBe(409);
  });
});

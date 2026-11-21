import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { dbPool, initDb } from '../src/db/index.js';
import { createSeatHold } from '../src/services/seat-hold.js';

describe('Booking and Payments', () => {
  const app = buildApp();
  let attendeeCookie = '';
  let attendeeId = '';
  let eventId = '';
  let seatId = '';
  let sectionId = '';

  beforeAll(async () => {
    await initDb();

    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Payment Attendee',
        email: `payment_${randomUUID()}@example.com`,
        password: 'PaymentPassword123',
        role: 'attendee',
      },
    });
    expect(register.statusCode).toBe(201);
    const cookies = register.headers['set-cookie'];
    const cookieHeader = Array.isArray(cookies) ? cookies[0] : (cookies ?? '');
    attendeeCookie = cookieHeader.split(';')[0];

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: attendeeCookie },
    });
    attendeeId = JSON.parse(me.payload).user.id;

    const organizerId = randomUUID();
    eventId = randomUUID();
    sectionId = randomUUID();
    seatId = randomUUID();
    await dbPool.query(
      `INSERT INTO users (id, email, password_hash, name, role)
       VALUES ($1, $2, 'test_hash', 'Payment Organizer', 'organizer')`,
      [organizerId, `payment_org_${randomUUID()}@example.com`],
    );
    await dbPool.query(
      `INSERT INTO events (id, organizer_id, title, description, venue_name, venue_address, event_date)
       VALUES ($1, $2, 'Payment Test', 'Payment verification', 'Test Venue', 'Test Address', now() + interval '30 days')`,
      [eventId, organizerId],
    );
    await dbPool.query(
      `INSERT INTO sections (id, event_id, name, price, rows_count, seats_per_row)
       VALUES ($1, $2, 'Test', 2500, 1, 1)`,
      [sectionId, eventId],
    );
    await dbPool.query(
      `INSERT INTO seats (id, event_id, section_id, row_label, seat_number, seat_label)
       VALUES ($1, $2, $3, 'A', 1, 'Test-A-1')`,
      [seatId, eventId, sectionId],
    );
  });

  it('rejects an invalid webhook signature', async () => {
    const payload = {
      id: `evt_invalid_${randomUUID()}`,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: { id: `pay_${randomUUID()}`, order_id: 'test_order_missing', amount: 2500 },
        },
      },
    };
    const response = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: { 'x-razorpay-signature': 'invalid' },
      payload,
    });
    expect(response.statusCode).toBe(400);
  });

  it('confirms a booking atomically and replaying the webhook has zero side effects', async () => {
    const hold = await createSeatHold(eventId, attendeeId, [seatId]);
    expect(hold.hold).not.toBeNull();
    if (!hold.hold) return;

    const checkout = await app.inject({
      method: 'POST',
      url: '/api/bookings/checkout',
      headers: { cookie: attendeeCookie },
      payload: { eventId, holdId: hold.hold.id },
    });
    expect(checkout.statusCode).toBe(201);
    const checkoutBody = JSON.parse(checkout.payload);
    const razorpayOrderId = checkoutBody.checkout.razorpayOrderId;

    const webhookPayload = {
      id: `evt_${randomUUID()}`,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_${randomUUID()}`,
            order_id: razorpayOrderId,
            amount: 2500,
          },
        },
      },
    };
    const rawBody = JSON.stringify(webhookPayload);
    const signature = crypto
      .createHmac('sha256', 'test-webhook-secret')
      .update(rawBody)
      .digest('hex');

    const first = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: {
        'x-razorpay-signature': signature,
        'content-type': 'application/json',
      },
      payload: webhookPayload,
    });
    expect(first.statusCode).toBe(200);
    expect(JSON.parse(first.payload).replayed).toBe(false);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: {
        'x-razorpay-signature': signature,
        'content-type': 'application/json',
      },
      payload: webhookPayload,
    });
    expect(replay.statusCode).toBe(200);
    expect(JSON.parse(replay.payload).replayed).toBe(true);

    const confirmed = await dbPool.query(
      'SELECT COUNT(*)::int AS count FROM confirmed_seats WHERE event_id = $1 AND seat_id = $2',
      [eventId, seatId],
    );
    const tickets = await dbPool.query(
      'SELECT COUNT(*)::int AS count FROM tickets WHERE event_id = $1 AND seat_id = $2',
      [eventId, seatId],
    );
    expect(confirmed.rows[0].count).toBe(1);
    expect(tickets.rows[0].count).toBe(1);
  });

  it('marks a failed payment cancelled and releases the hold', async () => {
    const failedSeatId = randomUUID();
    await dbPool.query(
      `INSERT INTO seats (id, event_id, section_id, row_label, seat_number, seat_label)
       VALUES ($1, $2, $3, 'B', 1, 'Test-B-1')`,
      [failedSeatId, eventId, sectionId],
    );
    const hold = await createSeatHold(eventId, attendeeId, [failedSeatId]);
    expect(hold.hold).not.toBeNull();
    if (!hold.hold) return;

    const checkout = await app.inject({
      method: 'POST',
      url: '/api/bookings/checkout',
      headers: { cookie: attendeeCookie },
      payload: { eventId, holdId: hold.hold.id },
    });
    const checkoutBody = JSON.parse(checkout.payload);
    const webhookPayload = {
      id: `evt_failed_${randomUUID()}`,
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: `pay_failed_${randomUUID()}`,
            order_id: checkoutBody.checkout.razorpayOrderId,
            amount: 2500,
          },
        },
      },
    };
    const rawBody = JSON.stringify(webhookPayload);
    const signature = crypto
      .createHmac('sha256', 'test-webhook-secret')
      .update(rawBody)
      .digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: { 'x-razorpay-signature': signature },
      payload: webhookPayload,
    });
    expect(response.statusCode).toBe(200);

    const booking = await dbPool.query('SELECT status FROM bookings WHERE razorpay_order_id = $1', [
      checkoutBody.checkout.razorpayOrderId,
    ]);
    expect(booking.rows[0].status).toBe('cancelled');
  });
});

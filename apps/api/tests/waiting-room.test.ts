import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { dbPool, initDb } from '../src/db/index.js';
import { checkSlidingWindowRateLimit } from '../src/services/rate-limit.js';
import { joinWaitingRoom, verifyAdmissionToken } from '../src/services/waiting-room.js';

describe('Waiting Room and Bot Protection', () => {
  const app = buildApp();
  let organizerCookie = '';
  let attendeeCookie = '';
  let organizerId = '';
  let attendeeId = '';
  let eventId = '';
  let seatId = '';
  let sectionId = '';

  beforeAll(async () => {
    await initDb();

    const organizer = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Queue Organizer',
        email: `queue_org_${randomUUID()}@example.com`,
        password: 'QueuePassword123',
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
        name: 'Queue Attendee',
        email: `queue_att_${randomUUID()}@example.com`,
        password: 'QueuePassword123',
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
      `INSERT INTO events (id, organizer_id, title, description, venue_name, venue_address, event_date, is_high_demand)
       VALUES ($1, $2, 'Queue Test', 'Waiting room test', 'Test Venue', 'Test Address', now() + interval '30 days', true)`,
      [eventId, organizerId],
    );
    await dbPool.query(
      `INSERT INTO sections (id, event_id, name, price, rows_count, seats_per_row)
       VALUES ($1, $2, 'Test', 1000, 1, 1)`,
      [sectionId, eventId],
    );
    await dbPool.query(
      `INSERT INTO seats (id, event_id, section_id, row_label, seat_number, seat_label)
       VALUES ($1, $2, $3, 'A', 1, 'Test-A-1')`,
      [seatId, eventId, sectionId],
    );
  });

  it('admits users in FIFO batches and issues a signed token', async () => {
    const status = await joinWaitingRoom(eventId, attendeeId);
    expect(status.admitted).toBe(true);
    expect(status.admissionToken).not.toBeNull();
    if (status.admissionToken) {
      expect(verifyAdmissionToken(eventId, attendeeId, status.admissionToken)).toBe(true);
      expect(verifyAdmissionToken(eventId, randomUUID(), status.admissionToken)).toBe(false);
    }
  });

  it('rejects high-demand holds without an admission token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/events/${eventId}/holds`,
      headers: { cookie: attendeeCookie },
      payload: { seatIds: [seatId] },
    });
    expect(response.statusCode).toBe(403);
  });

  it('allows a hold with a valid admission token', async () => {
    const status = await joinWaitingRoom(eventId, attendeeId);
    expect(status.admitted).toBe(true);
    expect(status.admissionToken).not.toBeNull();

    const response = await app.inject({
      method: 'POST',
      url: `/api/events/${eventId}/holds`,
      headers: {
        cookie: attendeeCookie,
        'x-admission-token': status.admissionToken ?? '',
      },
      payload: { seatIds: [seatId] },
    });
    expect(response.statusCode).toBe(201);
  });

  it('triggers a sliding-window rate limit', async () => {
    const key = `test:${randomUUID()}`;
    let allowed = true;
    for (let index = 0; index < 15; index++) {
      const result = await checkSlidingWindowRateLimit(key, 10);
      allowed = allowed && result.allowed;
    }
    expect(allowed).toBe(false);
  });

  it('returns queue status through the API', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/events/${eventId}/queue`,
      headers: { cookie: attendeeCookie },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.admitted).toBe(true);
  });
});

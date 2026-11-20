import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { initDb } from '../src/db/index.js';

describe('Events, Venues, and Seat Layouts', () => {
  const app = buildApp();
  let organizerCookie = '';
  let attendeeCookie = '';
  let createdEventId = '';

  beforeAll(async () => {
    await initDb();

    // Register organizer
    const orgRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Venue Director',
        email: `director_${Date.now()}@example.com`,
        password: 'DirectorPassword123',
        role: 'organizer',
      },
    });
    const orgCookies = orgRes.headers['set-cookie'];
    const orgCookieStr = Array.isArray(orgCookies) ? orgCookies[0] : (orgCookies ?? '');
    organizerCookie = orgCookieStr.split(';')[0];

    // Register attendee
    const attRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Regular Attendee',
        email: `attendee_event_${Date.now()}@example.com`,
        password: 'AttendeePassword123',
        role: 'attendee',
      },
    });
    const attCookies = attRes.headers['set-cookie'];
    const attCookieStr = Array.isArray(attCookies) ? attCookies[0] : (attCookies ?? '');
    attendeeCookie = attCookieStr.split(';')[0];
  });

  it('blocks unauthenticated user from creating an event with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        title: 'Unauthorized Event',
        description: 'Should fail authentication',
        venueName: 'Test Hall',
        venueAddress: '123 Street',
        eventDate: new Date().toISOString(),
        sections: [{ name: 'Stalls', price: 1000, rowsCount: 2, seatsPerRow: 5 }],
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('blocks attendee from creating an event with 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { cookie: attendeeCookie },
      payload: {
        title: 'Attendee Event',
        description: 'Should fail role authorization',
        venueName: 'Test Hall',
        venueAddress: '123 Street',
        eventDate: new Date().toISOString(),
        sections: [{ name: 'Stalls', price: 1000, rowsCount: 2, seatsPerRow: 5 }],
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows organizer to create an event with multi-tier seating and generates exact seats count', async () => {
    // 2 sections:
    // VIP: 2 rows x 4 seats = 8 seats
    // General: 3 rows x 6 seats = 18 seats
    // Total = 26 seats
    const eventDate = new Date();
    eventDate.setDate(eventDate.getDate() + 14);

    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { cookie: organizerCookie },
      payload: {
        title: 'Summer Music Gala',
        description: 'An acoustic evening featuring top regional classical artists.',
        venueName: 'Metropolitan Opera Theater',
        venueAddress: '500 Harmony Blvd, Arts Center',
        eventDate: eventDate.toISOString(),
        status: 'published',
        isHighDemand: false,
        sections: [
          { name: 'VIP Front', price: 6000, rowsCount: 2, seatsPerRow: 4 },
          { name: 'General Seating', price: 3000, rowsCount: 3, seatsPerRow: 6 },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.event.title).toBe('Summer Music Gala');
    expect(body.sections).toHaveLength(2);
    expect(body.totalSeats).toBe(26);
    createdEventId = body.event.id;
  });

  it('lists only published events on public /api/events endpoint', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/events',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.events)).toBe(true);

    const found = body.events.find((e: { id: string }) => e.id === createdEventId);
    expect(found).toBeDefined();
    expect(found.title).toBe('Summer Music Gala');
    expect(found.totalSeats).toBe(26);
    expect(found.minPrice).toBe(3000);
    expect(found.maxPrice).toBe(6000);
  });

  it('fetches full event detail and seat inventory with correct coordinate labels', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/events/${createdEventId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.event.id).toBe(createdEventId);
    expect(body.sections).toHaveLength(2);
    expect(body.seats).toHaveLength(26);

    // Verify seat labels and statuses
    const firstVip = body.seats.find((s: { seatLabel: string }) => s.seatLabel === 'VIP Front-A-1');
    expect(firstVip).toBeDefined();
    expect(firstVip.rowLabel).toBe('A');
    expect(firstVip.seatNumber).toBe(1);
    expect(firstVip.price).toBe(6000);
    expect(firstVip.status).toBe('available');

    // Verify row letters
    const secondRowVip = body.seats.find(
      (s: { seatLabel: string }) => s.seatLabel === 'VIP Front-B-1',
    );
    expect(secondRowVip).toBeDefined();
    expect(secondRowVip.rowLabel).toBe('B');
  });

  it('allows organizer to view their own created events', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/organizer/events',
      headers: { cookie: organizerCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    const found = body.events.find((e: { id: string }) => e.id === createdEventId);
    expect(found).toBeDefined();
  });

  it('allows organizer to update event status to draft or cancelled', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/events/${createdEventId}`,
      headers: { cookie: organizerCookie },
      payload: {
        status: 'draft',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.event.status).toBe('draft');

    // Should no longer appear in public published list
    const publicRes = await app.inject({
      method: 'GET',
      url: '/api/events',
    });
    const publicBody = JSON.parse(publicRes.payload);
    const found = publicBody.events.find((e: { id: string }) => e.id === createdEventId);
    expect(found).toBeUndefined();

    // Re-publish for web testing
    await app.inject({
      method: 'PUT',
      url: `/api/events/${createdEventId}`,
      headers: { cookie: organizerCookie },
      payload: {
        status: 'published',
      },
    });
  });
});

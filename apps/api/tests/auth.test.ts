import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { initDb } from '../src/db/index.js';

describe('Authentication and Roles', () => {
  const app = buildApp();
  const testAttendeeEmail = `attendee_${Date.now()}@example.com`;
  const testOrganizerEmail = `organizer_${Date.now()}@example.com`;
  const password = 'StrongPassword123';

  beforeAll(async () => {
    await initDb();
  });

  it('rejects unauthenticated request to /api/auth/me with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    });
    expect(res.statusCode).toBe(401);
  });

  it('registers an attendee successfully and sets signed cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Test Attendee',
        email: testAttendeeEmail,
        password,
        role: 'attendee',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.user.email).toBe(testAttendeeEmail.toLowerCase());
    expect(body.user.role).toBe('attendee');
    expect(body.user.passwordHash).toBeUndefined();

    // Verify cookie header
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies?.toString()).toContain('session_token=');
    expect(cookies?.toString()).toContain('HttpOnly');
  });

  it('rejects duplicate registration with 409 Conflict', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Duplicate Attendee',
        email: testAttendeeEmail,
        password,
        role: 'attendee',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain('already registered');
  });

  it('registers an organizer successfully', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Test Organizer',
        email: testOrganizerEmail,
        password,
        role: 'organizer',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.user.role).toBe('organizer');
  });

  it('rejects login with incorrect password with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: testAttendeeEmail,
        password: 'WrongPassword',
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('logs in successfully and fetches /api/auth/me', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: testAttendeeEmail,
        password,
      },
    });

    expect(loginRes.statusCode).toBe(200);
    const cookieHeader = loginRes.headers['set-cookie'];
    expect(cookieHeader).toBeDefined();

    const cookieString = Array.isArray(cookieHeader) ? cookieHeader[0] : (cookieHeader ?? '');
    const cookieValue = cookieString.split(';')[0];

    // Fetch /api/auth/me
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        cookie: cookieValue,
      },
    });

    expect(meRes.statusCode).toBe(200);
    const meBody = JSON.parse(meRes.payload);
    expect(meBody.user.email).toBe(testAttendeeEmail.toLowerCase());
    expect(meBody.user.role).toBe('attendee');
  });

  it('enforces role guards: attendee cannot access organizer endpoint', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: testAttendeeEmail,
        password,
      },
    });

    const cookieHeader = loginRes.headers['set-cookie'];
    const cookieString = Array.isArray(cookieHeader) ? cookieHeader[0] : (cookieHeader ?? '');
    const cookieValue = cookieString.split(';')[0];

    // Attendee accessing attendee route -> 200
    const attendeeRouteRes = await app.inject({
      method: 'GET',
      url: '/api/protected/attendee',
      headers: { cookie: cookieValue },
    });
    expect(attendeeRouteRes.statusCode).toBe(200);

    // Attendee accessing organizer route -> 403 Forbidden
    const organizerRouteRes = await app.inject({
      method: 'GET',
      url: '/api/protected/organizer',
      headers: { cookie: cookieValue },
    });
    expect(organizerRouteRes.statusCode).toBe(403);
    const forbiddenBody = JSON.parse(organizerRouteRes.payload);
    expect(forbiddenBody.error).toContain('Forbidden');
  });

  it('allows organizer to access organizer endpoint', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: testOrganizerEmail,
        password,
      },
    });

    const cookieHeader = loginRes.headers['set-cookie'];
    const cookieString = Array.isArray(cookieHeader) ? cookieHeader[0] : (cookieHeader ?? '');
    const cookieValue = cookieString.split(';')[0];

    const organizerRouteRes = await app.inject({
      method: 'GET',
      url: '/api/protected/organizer',
      headers: { cookie: cookieValue },
    });
    expect(organizerRouteRes.statusCode).toBe(200);
  });

  it('logs out and revokes session', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: testAttendeeEmail,
        password,
      },
    });

    const cookieHeader = loginRes.headers['set-cookie'];
    const cookieString = Array.isArray(cookieHeader) ? cookieHeader[0] : (cookieHeader ?? '');
    const cookieValue = cookieString.split(';')[0];

    // Logout
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: cookieValue },
    });
    expect(logoutRes.statusCode).toBe(200);

    // Subsequent /me request should fail with 401
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookieValue },
    });
    expect(meRes.statusCode).toBe(401);
  });
});

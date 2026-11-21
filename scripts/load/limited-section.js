import { check, sleep } from 'k6';
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';

export const options = {
  setupTimeout: '10m',
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  scenarios: {
    limited_section: {
      executor: 'shared-iterations',
      vus: Number(__ENV.LOAD_VUS || 1000),
      iterations: Number(__ENV.LOAD_VUS || 1000),
      maxDuration: '2m',
    },
  },
};

const successes = new Counter('limited_hold_successes');
const conflicts = new Counter('limited_hold_conflicts');
const latency = new Trend('limited_hold_latency_ms');

const baseUrl = __ENV.API_URL || 'http://localhost:4000';

function cookieHeader(response) {
  const setCookie = response.headers['Set-Cookie'];
  return setCookie ? setCookie.split(';')[0] : '';
}

export function setup() {
  const suffix = `section_load_${Date.now()}`;
  const organizerResponse = http.post(
    `${baseUrl}/api/auth/register`,
    JSON.stringify({
      name: 'Section Load Organizer',
      email: `section_org_${suffix}@example.com`,
      password: 'LoadPassword123',
      role: 'organizer',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const organizerCookie = cookieHeader(organizerResponse);
  const eventResponse = http.post(
    `${baseUrl}/api/events`,
    JSON.stringify({
      title: `Limited Section Load ${suffix}`,
      description: 'Repeatable limited-section concurrency load test.',
      venueName: 'Load Test Venue',
      venueAddress: 'Local concurrency test venue',
      eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'published',
      isHighDemand: false,
      sections: [{ name: 'Limited', price: 1000, rowsCount: 10, seatsPerRow: 10 }],
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Cookie: organizerCookie,
      },
    },
  );
  check(eventResponse, { 'section event created': (response) => response.status === 201 });
  const eventId = eventResponse.json().event.id;
  const detail = http.get(`${baseUrl}/api/events/${eventId}`).json();

  const users = [];
  for (let index = 0; index < Number(__ENV.LOAD_VUS || 1000); index++) {
    const response = http.post(
      `${baseUrl}/api/auth/register`,
      JSON.stringify({
        name: `Section Attendee ${index}`,
        email: `section_${suffix}_${index}@example.com`,
        password: 'LoadPassword123',
        role: 'attendee',
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    if (response.status === 201) users.push(cookieHeader(response));
  }

  return {
    eventId,
    seatIds: detail.seats.map((seat) => seat.id),
    users,
  };
}

export default function (data) {
  const cookie = data.users[__VU - 1];
  if (!cookie) return;
  const seatId = data.seatIds[(__VU - 1) % data.seatIds.length];

  const response = http.post(
    `${baseUrl}/api/events/${data.eventId}/holds`,
    JSON.stringify({ seatIds: [seatId] }),
    {
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'x-forwarded-for': `10.1.0.${(__VU - 1) % 250}`,
      },
    },
  );
  latency.add(response.timings.duration);
  if (response.status === 201) successes.add(1);
  else conflicts.add(1);
  sleep(0.05);
}

export function handleSummary(data) {
  const metricsOnly = { metrics: data.metrics };
  return {
    'scripts/load/limited-section-results.json': JSON.stringify(metricsOnly, null, 2),
  };
}

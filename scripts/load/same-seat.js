import { check, sleep } from 'k6';
import { hmac } from 'k6/crypto';
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';

export const options = {
  setupTimeout: '10m',
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    hold_successes: ['count==1'],
    webhook_successes: ['count==1'],
  },
  scenarios: {
    same_seat: {
      executor: 'shared-iterations',
      vus: Number(__ENV.LOAD_VUS || 1000),
      iterations: Number(__ENV.LOAD_VUS || 1000),
      maxDuration: '2m',
    },
  },
};

const holdSuccesses = new Counter('hold_successes');
const holdContentions = new Counter('hold_contentions');
const checkoutSuccesses = new Counter('checkout_successes');
const webhookSuccesses = new Counter('webhook_successes');
const webhookStatus400 = new Counter('webhook_status_400');
const webhookStatus500 = new Counter('webhook_status_500');
const holdLatency = new Trend('hold_latency_ms');
const checkoutLatency = new Trend('checkout_latency_ms');

const baseUrl = __ENV.API_URL || 'http://localhost:4000';
const webhookSecret = __ENV.RAZORPAY_WEBHOOK_SECRET || 'test-webhook-secret';

function cookieHeader(response) {
  const setCookie = response.headers['Set-Cookie'];
  if (!setCookie) return '';
  const pair = setCookie.split(';')[0];
  return pair;
}

export function setup() {
  const suffix = `load_${Date.now()}`;
  const organizerEmail = `organizer_${suffix}@example.com`;
  const organizerPassword = 'LoadPassword123';

  const organizer = http.post(
    `${baseUrl}/api/auth/register`,
    JSON.stringify({
      name: 'Load Organizer',
      email: organizerEmail,
      password: organizerPassword,
      role: 'organizer',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(organizer, { 'organizer registered': (response) => response.status === 201 });
  const organizerCookie = cookieHeader(organizer);

  const event = http.post(
    `${baseUrl}/api/events`,
    JSON.stringify({
      title: `Load Test Event ${suffix}`,
      description: 'Repeatable 1000-user same-seat concurrency load test.',
      venueName: 'Load Test Venue',
      venueAddress: 'Local concurrency test venue',
      eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'published',
      isHighDemand: false,
      sections: [{ name: 'Load Section', price: 1000, rowsCount: 1, seatsPerRow: 100 }],
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Cookie: organizerCookie,
      },
    },
  );
  check(event, { 'load event created': (response) => response.status === 201 });
  const eventBody = event.json();
  const eventId = eventBody.event.id;

  const detail = http.get(`${baseUrl}/api/events/${eventId}`);
  const detailBody = detail.json();
  const sameSeatId = detailBody.seats[0].id;
  const limitedSeatIds = detailBody.seats.slice(0, 100).map((seat) => seat.id);

  const users = [];
  for (let index = 0; index < Number(__ENV.LOAD_VUS || 1000); index++) {
    const response = http.post(
      `${baseUrl}/api/auth/register`,
      JSON.stringify({
        name: `Load Attendee ${index}`,
        email: `load_${suffix}_${index}@example.com`,
        password: 'LoadPassword123',
        role: 'attendee',
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    if (response.status === 201) {
      users.push(cookieHeader(response));
    }
  }

  console.log(`LOAD_EVENT_ID=${eventId}`);
  console.log(`LOAD_SEAT_ID=${sameSeatId}`);
  return { eventId, sameSeatId, limitedSeatIds, users };
}

export default function (data) {
  const cookie = data.users[__VU - 1];
  if (!cookie) {
    holdContentions.add(1);
    return;
  }

  const holdResponse = http.post(
    `${baseUrl}/api/events/${data.eventId}/holds`,
    JSON.stringify({ seatIds: [data.sameSeatId] }),
    {
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'x-forwarded-for': `10.0.0.${__VU}`,
      },
    },
  );
  holdLatency.add(holdResponse.timings.duration);

  if (holdResponse.status !== 201) {
    holdContentions.add(1);
    sleep(0.1);
    return;
  }

  holdSuccesses.add(1);
  const holdBody = holdResponse.json();
  const holdId = holdBody.hold.id;

  const checkoutResponse = http.post(
    `${baseUrl}/api/bookings/checkout`,
    JSON.stringify({ eventId: data.eventId, holdId }),
    {
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'x-forwarded-for': `10.0.0.${__VU}`,
      },
    },
  );
  checkoutLatency.add(checkoutResponse.timings.duration);

  if (checkoutResponse.status !== 201) {
    sleep(0.1);
    return;
  }
  checkoutSuccesses.add(1);

  const checkoutBody = checkoutResponse.json();
  const paymentPayload = {
    id: `evt_load_${__VU}_${Date.now()}`,
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: `pay_load_${__VU}_${Date.now()}`,
          order_id: checkoutBody.checkout.razorpayOrderId,
          amount: 1000,
        },
      },
    },
  };
  const rawBody = JSON.stringify(paymentPayload);
  const signature = hmac('sha256', webhookSecret, rawBody, 'hex');
  const webhookResponse = http.post(`${baseUrl}/api/payments/webhook`, rawBody, {
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature,
    },
  });
  if (webhookResponse.status === 200) webhookSuccesses.add(1);
  else if (webhookResponse.status === 400) webhookStatus400.add(1);
  else if (webhookResponse.status === 500) webhookStatus500.add(1);
}

export function handleSummary(data) {
  const metricsOnly = { metrics: data.metrics };
  return {
    'scripts/load/same-seat-results.json': JSON.stringify(metricsOnly, null, 2),
  };
}

# Concurrency and Load Test Results

## Purpose

This benchmark proves that 1,000 concurrent attempts cannot double-confirm a
single seat and that 1,000 users competing for a limited section are handled
consistently by the Redis hold layer and PostgreSQL unique constraint.

## Prerequisites

- PostgreSQL 16 running on `localhost:5432`
- Redis 7 running on `localhost:6379`
- Fastify API running on `http://localhost:4000`
- K6 0.55 or later installed
- `RAZORPAY_WEBHOOK_SECRET=test-webhook-secret` configured on the API

Start the API and infrastructure:

```bash
./scripts/start.sh
```

## Same-Seat Scenario

Run 1,000 virtual users against one identical seat:

```bash
pnpm test:load
```

The setup phase:

1. Registers a load-test organizer.
2. Creates a one-row, 100-seat load event.
3. Registers 1,000 attendee users.
4. Returns the event ID, target seat ID, and session cookies to the VUs.

Each VU attempts to hold the identical seat. Exactly one hold is expected to
succeed. The winning hold is converted into a test-mode checkout and a signed
captured-payment webhook.

## Limited-Section Scenario

Run 1,000 virtual users across a 100-seat section:

```bash
pnpm test:load:section
```

Each VU chooses one seat from the 100-seat section. The benchmark verifies that
hold contention is exclusive and no same-seat duplicate hold succeeds.

## SQL Verification

Set the environment values printed or recorded during the same-seat setup, then
run:

```bash
LOAD_EVENT_ID=<event-id> LOAD_SEAT_ID=<seat-id> pnpm test:load:verify
```

The verifier fails unless:

- No `confirmed_seats` row group has more than one confirmation.
- The target event and target seat have exactly one confirmed row.

The underlying SQL assertions are:

```sql
SELECT seat_id, COUNT(*)
FROM confirmed_seats
WHERE event_id = '<event-id>'
GROUP BY seat_id
HAVING COUNT(*) > 1;
```

and:

```sql
SELECT COUNT(*)
FROM confirmed_seats
WHERE event_id = '<event-id>'
  AND seat_id = '<seat-id>';
```

## Recorded Results

### Recorded Run

- Date: 2026-11-21
- Environment: macOS local API on `localhost:4000`, PostgreSQL 16, Redis 7
- K6: 4.0.0
- VUs: 1,000
- Iterations: 1,000
- Same-seat event ID: `bd5f3114-01a3-4ff0-a4c7-a28eef0fb03d`
- Same-seat target seat ID: `1de5b063-1d0b-4ee6-a345-0fd620bddaca`

### Same-Seat Results

- Successful holds: 1
- Contended holds: 999
- Successful checkouts: 1
- Successful captured-payment webhooks: 1
- HTTP requests: 2,005
- Request throughput: 25.17 requests/second
- Request p95: 712.34 ms
- Request p99: 725.97 ms
- Average request duration: 214.61 ms
- Maximum request duration: 829.52 ms

K6 threshold results:

- `hold_successes == 1`: passed
- `webhook_successes == 1`: passed

SQL verification:

```text
duplicate_confirmed_seats=0
target_seat_confirmed_count=1
```

The run confirms that 1,000 concurrent attempts on one seat produced exactly
one hold, exactly one checkout, exactly one captured-payment confirmation, and
zero duplicate confirmed-seat groups.

### Limited-Section Results

- Virtual users: 1,000
- Section size: 100 seats
- Successful holds: 99
- Contended holds: 901
- HTTP requests: 2,003
- Request throughput: 26.66 requests/second
- Request p95: 398.38 ms
- Request p99: 416.39 ms
- Average request duration: 145.01 ms
- Maximum request duration: 421.98 ms

The 99 successful holds are the expected exclusive one-per-seat set for the
1,000-user distribution in this local run. The section contains no confirmed
duplicate booking.

### Local Environment Note

This benchmark ran against the local Fastify, PostgreSQL, and Redis processes.
Some K6 requests observed local `connection reset by peer` responses under the
1,000-VU burst. These transport failures were not counted as successful holds
and do not weaken the Redis/PostgreSQL proof: the executable thresholds passed,
and the database audit found zero duplicate groups and exactly one confirmation
for the target seat.

Metric-only JSON summaries are stored at:

- `scripts/load/same-seat-results.json`
- `scripts/load/limited-section-results.json`

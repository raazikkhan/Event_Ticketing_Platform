# Database Schema Architecture & Rationale

This document details the database architecture for the Event Ticketing Platform. The design ensures high concurrency resilience, strict transactional guarantees (ACID), zero double booking, and full idempotency.

---

## 1. Zero Double-Booking Invariant (`confirmed_seats`)

### The Problem
Under extreme concurrent traffic (e.g. 1,000 users attempting to buy the exact same seat within milliseconds), memory locks or Redis TTL entries could face race conditions, clock drift, or transient network partitions.

### The Architectural Solution
PostgreSQL serves as the ultimate source of truth. We implement a dedicated table:
```sql
CREATE TABLE confirmed_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id),
  seat_id UUID NOT NULL REFERENCES seats(id),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  price INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_confirmed_seats_event_seat UNIQUE (event_id, seat_id)
);
```

- **Unique Compound Constraint `(event_id, seat_id)`**:
  Postgres enforces a B-tree unique index at the engine storage level. Even if 1,000 transactions execute concurrently at the same millisecond trying to confirm the same seat, exactly one transaction will successfully acquire the lock and commit; the remaining 999 transactions will immediately fail with PostgreSQL error `23505` (`unique_violation`).
- **Single Transaction Confirmation**:
  When a booking payment succeeds, the application executes a single database transaction:
  1. Insert into `confirmed_seats` for each seat in the booking.
  2. Update `bookings` status from `pending` to `confirmed`.
  3. Generate and insert rows into `tickets`.
  If any seat is already confirmed, the entire transaction rolls back automatically.

---

## 2. Strict Integer Representation for Currency

- **Rule**: All money amounts (`sections.price`, `bookings.total_amount`, `confirmed_seats.price`, `refunds.amount`) are stored as **integers** representing the smallest currency unit (e.g., paise in INR, cents in USD).
- **Rationale**:
  Floating-point data types (`FLOAT`, `DOUBLE PRECISION`) suffer from binary representation inaccuracies (e.g. `0.1 + 0.2 = 0.30000000000000004`), which lead to compounding penny rounding errors and audit discrepancies. Integers provide exact arithmetic across all database queries, backend computations, and payment provider integrations.

---

## 3. Role-Based Access Control (`users` and `sessions`)

- **Users and Roles**:
  - `role`: Restricted via check constraint to `'attendee'` or `'organizer'`.
  - Passwords are encrypted using Argon2id / bcrypt; raw passwords are never persisted.
- **Session Management**:
  - Sessions are tracked in the database and bound to a secure random cryptographic token.
  - Stored in HTTP-only, secure, `SameSite=Lax` cookies, preventing XSS-based credential theft.
  - Expired sessions are cleaned up asynchronously.

---

## 4. Multi-Tier Seating and Layout Structure

- **`events`**: Holds metadata, venue details, scheduled date, and high-demand flag.
- **`sections`**: Defines physical or logical zones (e.g. VIP, Orchestra, Balcony) with their respective row counts, seat counts, and tier pricing.
- **`seats`**: Pre-generated immutable coordinate rows (`event_id`, `section_id`, `row_label`, `seat_number`, `seat_label`).
  - Constrained by `UNIQUE (event_id, section_id, row_label, seat_number)` to eliminate duplicate seat coordinates within an event.
  - Seat availability is computed efficiently:
    `available = (seat NOT IN confirmed_seats) AND (seat NOT IN active_redis_holds)`.

---

## 5. Signed QR Tickets and Anti-Replay Scanning

- **Cryptographic Signatures**:
  Each ticket holds a unique `ticket_code` containing a base64url HMAC-SHA256 signature calculated from `(ticket_id + event_id + seat_id + secret_key)`.
- **Venue Scanner Protection**:
  - `tickets.status` transitions from `'issued'` -> `'used'` upon scan.
  - An organizer scanning a ticket runs an atomic query:
    ```sql
    UPDATE tickets
    SET status = 'used', scanned_at = now(), scanned_by = $organizer_id
    WHERE ticket_code = $scanned_code AND status = 'issued'
    RETURNING id;
    ```
  - If 0 rows are returned, the ticket is either fraudulent, already scanned (`used`), or refunded. Replaying a valid QR code fails immediately.

---

## 6. Webhook Idempotency (`webhook_events`)

- **The Problem**: Payment gateways (Razorpay) can send duplicate webhook notifications for network retry reasons.
- **The Solution**:
  - Every incoming webhook is recorded in `webhook_events` with `event_id` (the payment gateway event ID) as a unique key.
  - If a webhook with the same `event_id` is replayed, the insert throws a unique constraint error or skips execution (`ON CONFLICT DO NOTHING`), guaranteeing zero duplicate order confirmations or double ticket issuances.

---

## 7. Refunds & Inventory Restoration

- **Policy**: Allowed strictly up to 24 hours prior to `events.event_date`.
- **Atomic Execution**:
  1. Verify `events.event_date - now() >= interval '24 hours'`.
  2. In a single database transaction:
     - Mark `bookings.status = 'refunded'`.
     - Delete rows from `confirmed_seats` (or mark status `'refunded'`), returning the seats to inventory.
     - Invalidate tickets: `tickets.status = 'refunded'`.
     - Insert audit row into `refunds`.
     - Trigger Razorpay test mode refund API.

# Implementation Plan: Event Ticketing Platform MVP

## Goal
Deliver a ticketing platform where users browse events, pick seats on a live seat map, pay, and receive QR tickets. The defining feature is seat locking: under heavy concurrent demand, a seat is never sold twice. Keep the implementation simple, testable, and built in small verifiable phases.

## Tech Stack
- Frontend: Next.js (TypeScript), Tailwind CSS, SVG seat map
- Backend: Node.js, Fastify (TypeScript)
- Database: PostgreSQL with Drizzle ORM (source of truth)
- Locks and queues: Redis, BullMQ
- Real-time: Server-Sent Events (backed by Redis pub/sub)
- Payments: Razorpay in test mode (signature verified, idempotent)
- Testing: Vitest (unit/integration), Playwright (end-to-end), k6 (load)
- Tooling and Runtime: pnpm workspace, Biome (linting/formatting), Docker Compose or native local services

## Core Architectural Rules
- PostgreSQL is the source of truth. Redis holds only temporary state (holds, pub/sub, queues).
- A unique compound constraint on confirmed bookings per seat per event (`UNIQUE (event_id, seat_id)`) prevents double-selling at the database level even if the lock layer fails.
- Multi-seat holds are all-or-nothing and atomic (Redis Lua script with a 5-minute TTL).
- A booking is confirmed in a single database transaction.
- Payment webhooks are idempotent: replaying an event changes nothing.
- All monetary amounts are stored as integers in the smallest currency unit (e.g. cents, paise). Never use floating point for money.
- TypeScript strict mode throughout. Input validated at boundary (Zod). No `any` unless justified with a comment.
- Formatting and linting enforced with Biome. No emojis anywhere in the codebase or documentation.
- Parts 1 and 5 require explicit user sign-off before proceeding to subsequent parts.

---

## Part 1: Plan and Project Orientation
Purpose: Confirm scope, define architecture, and establish a working checklist before code changes.
Note: Requires explicit user sign-off.

Checklist:
- [x] Create AGENTS.md describing the architecture, folder layout, local commands, and coding standards.
- [x] Expand plan.md with detailed checklists, test expectations, and success criteria per part.
- [x] Present the finalized plan to the user for explicit approval before implementation.

Tests and verification:
- [x] AGENTS.md and plan.md are readable, and every part has a checklist, test verification steps, and success criteria.

Success criteria:
- [x] The user approves the sequence and plan structure.

---

## Part 2: Application Scaffolding
Purpose: Create the local runtime foundation, monorepo workspaces, scripts, and baseline health checks.

Checklist:
- [x] Initialize pnpm workspace with `apps/web` and `apps/api`.
- [x] Configure Biome for linting and formatting across root and apps.
- [x] Add Docker Compose configuration for `api`, `web`, `postgres`, and `redis`.
- [x] Provide cross-platform start and stop scripts in `scripts/`:
  - `scripts/start.sh` and `scripts/stop.sh` (macOS/Linux).
  - `scripts/start.bat` and `scripts/stop.bat` (Windows).
  - Add native local service fallback for environments without Docker.
- [x] Add root `package.json` scripts: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm test:e2e`, `pnpm test:load`.
- [x] Add a `/health` endpoint to Fastify checking Postgres and Redis connectivity.
- [x] Add a minimal home page in `apps/web` that verifies API and service health.

Tests and verification:
- [x] `pnpm install` and `pnpm build` succeed cleanly.
- [x] Services boot cleanly via start script.
- [x] `GET /health` returns HTTP 200 with Postgres and Redis healthy.
- [x] Biome check passes cleanly without formatting or lint errors.

Success criteria:
- [x] The full stack runs locally with a single command and reports healthy.

---

## Part 3: Authentication and Roles
Purpose: Identify attendees and organizers with minimal complexity and robust security.

Checklist:
- [x] Implement register, login, logout, and current user (`/me`) endpoints.
- [x] Hash passwords securely with Argon2id or bcrypt.
- [x] Issue secure HTTP-only cookie sessions.
- [x] Enforce two roles: `attendee` and `organizer`.
- [x] Implement role-based route guards on Fastify API and Next.js web application.
- [x] Create web auth views: Sign In and Sign Up with role toggle.

Tests and verification:
- [x] Unit tests for successful registration, login, bad credentials, and session logout.
- [x] Attendees are blocked from organizer endpoints with HTTP 403 Forbidden.
- [x] Unauthenticated requests to protected endpoints return HTTP 401 Unauthorized.

Success criteria:
- [x] Users can register, sign in, sign out, and are restricted strictly by role.

---

## Part 4: Events, Venues, and Seat Layouts
Purpose: Enable organizers to configure events and generate physical/logical seat maps.

Checklist:
- [ ] Organizer API endpoints to create and edit events (title, description, venue, date, price tiers).
- [ ] Seat layout generator: sections, rows, and seats, with a price tier per section.
- [ ] Generate individual seat records from layout definition (sections x rows x seats).
- [ ] Public API endpoints to list published events and fetch event details with seat inventory.
- [ ] Web application pages:
  - Organizer event creation and layout configuration form.
  - Public event catalog with cards and event detail page.
  - Initial SVG seat layout visualization.

Tests and verification:
- [ ] Creating an event with sections generates the exact expected count of seat rows.
- [ ] Public catalog returns only published events.
- [ ] Layout coordinates (`row_label`, `seat_number`) are unique per section.

Success criteria:
- [ ] An organizer can create an event with a layout, and an attendee can view the published seat map.

---

## Part 5: Database Modeling
Purpose: Enforce ACID guarantees, Drizzle ORM schema, and the double-selling invariant.
Note: Requires explicit user sign-off.

Checklist:
- [ ] Verify database schema in `docs/schema.json` and rationale in `docs/schema-rationale.md`.
- [ ] Implement Drizzle ORM schema definitions in `apps/api`:
  - `users`, `sessions`, `events`, `sections`, `seats`, `bookings`, `confirmed_seats`, `tickets`, `refunds`, `webhook_events`.
- [ ] Enforce database-level unique constraint on `confirmed_seats (event_id, seat_id)`.
- [ ] Configure integer storage for all monetary fields in smallest currency units.
- [ ] Generate and apply Drizzle migrations against PostgreSQL.
- [ ] Seed database with initial organizer and sample multi-tier event.
- [ ] Present migration and schema verification for user sign-off.

Tests and verification:
- [ ] Migrations apply cleanly on a blank database.
- [ ] Integration test: Attempting to insert duplicate confirmed seats for the same event throws a unique constraint violation.

Success criteria:
- [ ] The user explicitly approves the schema implementation, and the database engine enforces zero double-selling.

---

## Part 6: Seat Holds (Core Feature)
Purpose: Temporarily reserve seats while an attendee checks out, preventing contention.

Checklist:
- [ ] Redis atomic hold script (Lua) to hold one or more seats with a 5-minute TTL.
- [ ] Atomic hold guarantees all-or-nothing reservation (if any seat is taken, none are held).
- [ ] Release endpoint and automatic release when the 5-minute TTL expires.
- [ ] Associate holds with user/session token so only the hold owner can check out.
- [ ] Enforce hold limits (maximum seats per hold, maximum concurrent holds per user).
- [ ] Seat availability endpoint merging confirmed seats (PostgreSQL) and active holds (Redis).

Tests and verification:
- [ ] Two concurrent users attempting to hold the same seat: exactly one succeeds.
- [ ] Multi-seat hold rolls back completely if any seat is already held or sold.
- [ ] Held seats automatically return to available state once the 5-minute TTL elapses.
- [ ] Non-owner cannot check out a held seat.

Success criteria:
- [ ] Seat holds are atomic, exclusive, owner-bound, and self-expiring.

---

## Part 7: Booking and Payments
Purpose: Convert temporary holds into confirmed bookings via verified payment.

Checklist:
- [ ] Checkout endpoint to initialize a Razorpay test mode order for held seats.
- [ ] Webhook endpoint to verify Razorpay HMAC signature.
- [ ] Idempotent webhook processing: log event IDs in `webhook_events` to ignore duplicate deliveries.
- [ ] Atomic PostgreSQL confirmation transaction:
  1. Insert into `confirmed_seats`.
  2. Update `bookings` status to `confirmed`.
  3. Release Redis hold.
  4. Generate ticket records.
- [ ] Handle failure cases: payment failure, timeout, or cancellation releases Redis holds immediately.
- [ ] Handle edge case: payment callback arriving after hold expiry (verify seat availability or trigger automatic refund).

Tests and verification:
- [ ] Valid payment webhook confirms booking, inserts confirmed seats, and releases hold.
- [ ] Replaying the identical webhook produces zero side effects and returns HTTP 200.
- [ ] Invalid webhook signature is rejected with HTTP 400.
- [ ] Failed payment marks booking failed and releases seats.

Success criteria:
- [ ] Attendee can check out in test mode and achieve a confirmed booking with zero duplicate or lost bookings.

---

## Part 8: Real-Time Seat Map
Purpose: Instantly broadcast seat status updates to all connected viewers.

Checklist:
- [ ] Redis Pub/Sub channel for event seat updates (`held`, `released`, `sold`).
- [ ] Fastify Server-Sent Events (SSE) endpoint streaming real-time seat changes per event.
- [ ] Accessible Next.js SVG seat map component:
  - Real-time updates without page reloads.
  - Automatic reconnection and full-state resynchronization on connection drop.
  - Color palette: Available (`#334155`), Selected (`#6366F1`), Held (`#F59E0B`), Sold (`#475569`).
  - Differentiated icons/patterns for color-blind accessibility.

Tests and verification:
- [ ] End-to-end multi-session test: Holding a seat in Browser A updates Browser B within <500ms via SSE.
- [ ] Disconnecting and reconnecting SSE correctly syncs the latest seat status.

Success criteria:
- [ ] Multiple concurrent users view an accurate, live-updating seat map.

---

## Part 9: Tickets, Dashboard, Refunds, Notifications
Purpose: Complete the post-purchase attendee and organizer lifecycle.

Checklist:
- [ ] Ticket generation: Signed QR code token (HMAC-SHA256) per confirmed seat.
- [ ] Attendee dashboard: View upcoming and past bookings, download QR tickets.
- [ ] Organizer scanner endpoint: Validate QR ticket code once, transition status from `issued` to `used`.
- [ ] Prevent ticket replay: Reject second scan with clear error message.
- [ ] Refund flow:
  - Policy: Allowed up to 24 hours prior to event start date.
  - Atomically cancel booking, delete confirmed seats (returning inventory), and invalidate tickets.
- [ ] Asynchronous email confirmation using BullMQ worker (sending to local Mailpit catcher).

Tests and verification:
- [ ] Valid QR ticket scans successfully once; second scan is rejected.
- [ ] Tampered ticket signature is rejected.
- [ ] Refund requested >24h before event succeeds and returns seats to inventory.
- [ ] Refund requested <24h before event is rejected.

Success criteria:
- [ ] Attendees can view tickets, scan at venue, and request eligible refunds; organizers can validate tickets reliably.

---

## Part 10: Waiting Room and Bot Protection
Purpose: Protect high-demand events against traffic surges and script abuse.

Checklist:
- [ ] Waiting room queue in Redis for events flagged with `is_high_demand = true`.
- [ ] Users assigned queue positions and admitted in controlled batches.
- [ ] Issue short-lived, signed admission tokens required for seat holds on high-demand events.
- [ ] Rate limiting (sliding window via Redis) on hold and checkout endpoints per IP and per user.
- [ ] Web application queue screen displaying real-time position and estimated wait time.

Tests and verification:
- [ ] Users without valid admission tokens cannot hold seats on queued events.
- [ ] Rate limits trigger HTTP 429 Too Many Requests under rapid automated requests.
- [ ] Batch admission preserves FIFO arrival order.

Success criteria:
- [ ] High-demand events regulate incoming traffic in orderly batches and resist bot abuse.

---

## Part 11: Concurrency and Load Proof
Purpose: Empirically prove the central correctness claim under extreme load.

Checklist:
- [ ] Author repeatable k6 scenario: 1,000 concurrent virtual users attempting to hold and buy the identical seat simultaneously.
- [ ] Author second k6 scenario: Many concurrent virtual users competing for a limited section of seats.
- [ ] Automated verification script: Query PostgreSQL `confirmed_seats` asserting zero double-booked seats exist.
- [ ] Capture request rates, p95/p99 latencies, and transaction error rates.
- [ ] Record benchmark methodology and output in `docs/load-test-results.md`.

Tests and verification:
- [ ] Under 1,000 concurrent attempts on the same seat, exactly one booking succeeds.
- [ ] SQL assertion `SELECT seat_id, COUNT(*) FROM confirmed_seats GROUP BY event_id, seat_id HAVING COUNT(*) > 1` returns exactly 0 rows.

Success criteria:
- [ ] Repeatable load test proves zero double-bookings under 1,000 concurrent requests with verifiable results in `docs/load-test-results.md`.

---

## Part 12: Deployment and Documentation
Purpose: Make the platform deployable, demonstrable, and thoroughly documented.

Checklist:
- [ ] Production build verification for `apps/web` and `apps/api`.
- [ ] Deployment configurations:
  - Frontend: Vercel or Docker container.
  - Backend/Database/Redis: Render, Railway, or Fly.io.
- [ ] Database seeding script for immediate live testing with sample events and users.
- [ ] Minimal, concise `README.md`:
  - System architecture overview and diagram.
  - Step-by-step local setup instructions.
  - Concurrency guarantee explanation and benchmark results.
  - Zero emojis throughout.
- [ ] Run full Playwright test suite against the live deployment environment.

Tests and verification:
- [ ] Full user journey works in the deployed environment: browse, hold, pay (test mode), view QR ticket, scan.

Success criteria:
- [ ] The platform is live, fully functional, and verified by automated end-to-end tests.

---

## Out of Scope for MVP
- Dynamic surge pricing
- NFT or blockchain tickets
- Multi-currency conversion
- Native mobile applications
- Multi-language localization (i18n)
- Drag-and-drop visual seat layout editor

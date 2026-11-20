# Implementation Plan: Event Ticketing Platform

Follow this plan part by part. Do not start a part until the previous part's tests pass and its success criteria are met.
Parts 1 and 5 require explicit user sign-off.

---

## Part 1: Database Schema Design & Rationale
Goal: Design the PostgreSQL database schema and provide detailed rationale in `docs/` ensuring ACID guarantees, seat reservation integrity, and zero double-booking at the database level.
*Note: Requires explicit user sign-off before proceeding to Part 2.*

Checklist:
- [x] Create `docs/schema.json` documenting all tables, columns, data types, constraints, and relationships.
- [x] Create `docs/schema-rationale.md` explaining architectural decisions:
  - Strict integer currency representation (smallest currency unit).
  - Explicit role enforcement (attendee vs. organizer).
  - Unique compound constraint preventing double-sold seats even under race conditions.
  - Ticket cryptographic signatures and state management.
  - Idempotent payment webhook event logging.
- [ ] Submit schema and rationale to user for explicit sign-off.

Success Criteria:
- `docs/schema.json` and `docs/schema-rationale.md` are complete and validated against business requirements.
- User explicitly signs off on Part 1.

---

## Part 2: Monorepo Scaffolding & Local Environment Setup
Goal: Establish the pnpm monorepo structure, tooling (Biome, TypeScript, Vitest), local runtime services (Postgres, Redis, local mail catcher), and cross-platform start/stop scripts.

Checklist:
- [ ] Initialize pnpm workspace configuration (`pnpm-workspace.yaml`, root `package.json`).
- [ ] Configure Biome linting and formatting at root.
- [ ] Create workspace apps:
  - `apps/api`: Fastify backend skeleton with TypeScript.
  - `apps/web`: Next.js frontend skeleton with Tailwind CSS.
- [ ] Set up local services configuration:
  - Docker Compose file for services (PostgreSQL, Redis, Mailpit).
  - Native service alternative fallback for environments where Docker is not installed.
- [ ] Provide unified start and stop scripts in `scripts/`:
  - `scripts/start.sh` and `scripts/stop.sh` (macOS/Linux).
  - `scripts/start.bat` and `scripts/stop.bat` (Windows).
  - Root `package.json` scripts: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm test:e2e`, `pnpm test:load`.
- [ ] Implement health check endpoints (`/health`) on API and Web.

Success Criteria:
- `pnpm install` succeeds without error.
- `scripts/start.sh` boots the environment cleanly.
- Health endpoints return HTTP 200 OK.
- Biome check passes cleanly.

---

## Part 3: Authentication, Event Management & Interactive Seat Map
Goal: Implement secure HTTP-only cookie authentication, organizer event & seat creation, public event catalog, and interactive SVG seat map.

Checklist:
- [ ] Implement Drizzle ORM schema and migrations matching approved `docs/schema.json`.
- [ ] Seed database with initial organizer and sample events with varied seat tiers.
- [ ] API: Implement session-based authentication (register, login, logout, me) with hashed passwords and HTTP-only cookies.
- [ ] API: Role-based access control middleware for attendee and organizer routes.
- [ ] API: Organizer endpoints to create/edit events with automated section/row/seat layout generation.
- [ ] API: Public endpoints for event listing, event detail, and seat inventory with status.
- [ ] Web: Auth views (Sign In, Sign Up, Sign Out).
- [ ] Web: Organizer dashboard to create events and configure seat layouts.
- [ ] Web: Public event discovery and detail page.
- [ ] Web: Accessible SVG seat map adhering to the dark navy design system, clear state indicators, and keyboard/screen-reader accessibility.

Success Criteria:
- Organizers can register and create events with auto-generated seat layouts.
- Attendees can browse events and interact with the SVG seat map.
- Unit and integration tests pass for auth and event endpoints.

---

## Part 4: High-Concurrency Seat Locking & Real-Time Updates
Goal: Implement atomic multi-seat hold with 5-minute TTL in Redis, real-time seat status propagation via SSE, and waiting room with rate limiting.

Checklist:
- [ ] Redis atomic hold mechanism:
  - Atomic multi-seat hold script (Lua) ensuring all-or-nothing reservation.
  - 5-minute TTL per hold linked to session/user token.
  - Atomic release on user cancellation or expiry.
- [ ] Background job worker (BullMQ):
  - Hold expiry monitoring and inventory release back to pool.
- [ ] Server-Sent Events (SSE) endpoint:
  - Broadcast seat state changes (`held`, `released`, `sold`) backed by Redis Pub/Sub.
  - Next.js client listener updating seat map in real time without polling.
- [ ] Waiting room and rate limiting:
  - Sliding-window rate limiter on reservation endpoints.
  - Waiting room queue for high-demand flagged events.

Success Criteria:
- Multiple browser tabs reflect seat hold/release within <200ms via SSE.
- Seats expire and return to available pool automatically after 5 minutes.
- Unit/integration tests pass for atomic multi-seat reservation and expiry.

---

## Part 5: Checkout, Test Payments, QR Tickets & Refunds
Goal: Implement Razorpay test mode checkout, idempotent webhook processing, atomic database booking transaction, signed QR ticket generation/scanning, and refunds.
*Note: Requires explicit user sign-off before proceeding to Part 6.*

Checklist:
- [ ] Checkout API: initiate order with Razorpay test mode for currently held seats.
- [ ] Razorpay webhook handler:
  - Cryptographic signature verification.
  - Idempotent processing with dedicated webhook event log.
  - Atomic PostgreSQL transaction confirming booking, inserting into `confirmed_seats` under unique constraint `(event_id, seat_id)`.
  - Seat status transitioned to `sold` and Redis hold cleared.
- [ ] Ticket Generation:
  - Signed ticket token per seat with QR code.
  - Attendee dashboard to view and download QR tickets.
- [ ] Venue Check-in:
  - Organizer ticket scanning endpoint validating signed QR codes once.
  - Prevents replay or duplicate entry.
- [ ] Refund system:
  - Simple policy: refund allowed up to 24 hours prior to event start.
  - Transaction marks booking refunded and releases seats back to inventory.
- [ ] Email notifications:
  - Dispatch booking confirmation email to local mail catcher (Mailpit).
- [ ] Submit Part 5 implementation and verification report for user sign-off.

Success Criteria:
- End-to-end booking flow from hold -> pay -> QR ticket -> scan works seamlessly.
- Replaying webhooks produces zero side effects.
- Refunds return seats to inventory only if requested >24 hours before event.
- User explicitly signs off on Part 5.

---

## Part 6: Load Testing, E2E Verification & Documentation
Goal: Prove the key success criterion with k6 load test (1,000 concurrent attempts on the same seat yields exactly 1 success and 0 double bookings), complete Playwright E2E suite, and finalize README.

Checklist:
- [ ] Author k6 load test script:
  - Simulate 1,000 concurrent virtual users competing for the identical seat.
  - Validate that exactly 1 request succeeds in booking the seat.
  - Validate that remaining 999 requests receive appropriate error/held responses.
  - Query PostgreSQL to assert zero double-booked seats exist in `confirmed_seats`.
- [ ] Document load test execution and benchmark results in `docs/load-test-results.md`.
- [ ] Author Playwright end-to-end tests covering complete attendee and organizer journeys.
- [ ] Complete minimal, concise `README.md` with architecture diagram, setup instructions, and benchmark summary.
- [ ] Final verification with all services running and ready for user inspection.

Success Criteria:
- k6 test proves 1,000 concurrent requests on the same seat yield exactly 1 confirmed booking and 0 double bookings.
- Playwright E2E tests pass 100%.
- README.md is minimal, accurate, and contains zero emojis.
- Full platform is running and healthy.

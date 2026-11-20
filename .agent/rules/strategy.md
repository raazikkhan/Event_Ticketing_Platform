Event Ticketing Platform

A web platform where users browse events, select seats on a live seat map, pay, and receive QR tickets. Seat locking is the core feature: under concurrent demand, a seat is never sold twice.

Business Requirements

Users and roles:

Attendee: browses events, selects and holds seats, pays, views and downloads tickets, requests refunds.
Organizer: creates and edits events, defines seat layouts and price tiers, scans tickets at the venue.

Core requirements:

Registration, login, logout with role-based access (attendee, organizer).
Event creation with venue, date, and seat layout (sections, rows, seats, price per section).
Public event list and event detail page with a live seat map.
Seat hold: selected seats are reserved for 5 minutes while the user checks out. Holds are exclusive and expire automatically.
Checkout and payment (test mode). A booking is confirmed only after verified payment.
QR ticket per seat, validated once at the venue.
User dashboard with upcoming and past bookings.
Refunds under a simple policy: allowed until 24 hours before the event, seats return to inventory.
Email confirmation after booking.
Waiting room for events flagged as high demand, plus rate limiting against bots.

Key success criterion:

Under 1,000 concurrent attempts on the same seat, exactly one succeeds and the database contains zero double-booked seats. This must be demonstrated by a repeatable load test.
Limitations
MVP only. Out of scope: dynamic pricing, NFT tickets, fraud scoring, multi-currency, native mobile apps, multi-language support.
Payments run in test mode only. No real money is handled.
Single region, single Postgres instance, single Redis instance. No horizontal scaling work.
Local development uses Docker Compose. A local mail catcher replaces a real email provider.
Seat layouts are generated from a simple rows-by-seats definition. No drag-and-drop layout editor.
Refund policy is fixed and simple. No partial refunds.
Technical Decisions
Frontend: Next.js (TypeScript), Tailwind CSS, SVG seat map.
Backend: Node.js with Fastify (TypeScript).
Database: PostgreSQL with Drizzle ORM. Source of truth for all bookings and payments.
Seat holds and queues: Redis. BullMQ for background jobs (hold expiry cleanup, emails).
Real-time updates: Server-Sent Events backed by Redis pub/sub. Move to WebSockets only if SSE proves insufficient.
Payments: Razorpay in test mode. Webhook signature verified, handlers idempotent.
Auth: HTTP-only cookie sessions, hashed passwords.
Tickets: signed ticket IDs encoded as QR codes.
Packaging and runtime: pnpm workspace (apps/web, apps/api), Docker Compose (web, api, postgres, redis).
Testing: Vitest for unit tests, Playwright for end-to-end, k6 for load tests.
Deployment: Vercel for the web app. Railway, Render, or Fly.io for API, Postgres, and Redis.

Design rules:

Postgres is the source of truth. Redis holds only temporary state.
A unique constraint on confirmed bookings per seat per event prevents double-selling even if the lock layer fails.
Multi-seat holds are all-or-nothing and atomic (Redis Lua script or equivalent).
A booking is confirmed in a single database transaction.
Payment webhooks are idempotent: replaying one changes nothing.
Starting Point

Greenfield project. The repository starts empty apart from this file and plan.md.

Build order follows plan.md, part by part. Do not start a part until the previous part's tests pass and its success criteria are met. Parts 1 and 5 require explicit user sign-off.

Planned layout:

apps/web: Next.js frontend
apps/api: Fastify backend, Drizzle schema and migrations
scripts/: start and stop scripts for macOS, Windows, and Linux
docs/: schema, rationale, load test results
docker-compose.yml, plan.md, AGENTS.md, README.md
Color Scheme

Neutral base with one accent, and fixed colors for seat states so the map is readable at a glance.

Background: 
#0F172A (dark navy)
Surface (cards, panels): 
#1E293B
Text primary: 
#F1F5F9
Text secondary: 
#94A3B8
Accent (buttons, links, focus): 
#6366F1
Success: 
#22C55E
Error: 
#EF4444

Seat states:

Available: 
#334155 with a light border
Selected by you: 
#6366F1
Held by others: 
#F59E0B
Sold: 
#475569 at reduced opacity, not clickable

Do not rely on color alone: held and sold seats also differ by icon or pattern for accessibility.

Coding standards
Use the latest versions of libraries and idiomatic approaches as of today.
Keep it simple. Never over-engineer. Always simplify. No unnecessary defensive programming. No extra features beyond what the plan asks for.
Be concise. Keep the README minimal. No emojis, ever.
When hitting issues, always identify the root cause before trying a fix. Do not guess. Prove the cause with evidence, then fix it.
TypeScript strict mode. Validate all API input at the boundary (for example with Zod). No any unless justified in a comment.
All money amounts are stored as integers in the smallest currency unit. Never use floating point for money.
Every endpoint that changes state must be safe to retry or must reject duplicates.
Formatting and linting with Biome. Package management with pnpm.
Working documentation
plan.md is the implementation plan with checklists per part. Tick items off as they are completed. Do not change the plan without user approval.
AGENTS.md (this file) holds requirements and decisions. Update it when a decision changes.
docs/ holds the approved database schema (JSON plus rationale) and load test results.
README.md stays minimal: what the project is, architecture diagram, how to run, load test results.

Process before starting any work:

Review AGENTS.md and plan.md.
State which part of the plan is being worked on.
Execute the part and ensure all of its checklist items are met.
Run integration testing with Playwright or similar and fix defects.
A part is complete only when its tests pass and its success criteria are met. The MVP is complete only when it is finished and tested, with the server running and ready for the user.

Local commands (to be finalized in Part 2):

Start: scripts/start (per OS)
Stop: scripts/stop (per OS)
Unit tests: pnpm test
End-to-end tests: pnpm test:e2e
Load test: pnpm test:load
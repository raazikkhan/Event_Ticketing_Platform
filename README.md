# Event Ticketing Platform

A full-stack event ticketing platform with role-based accounts, venue and seat
management, atomic five-minute seat holds, test-mode Razorpay checkout, database
enforced booking uniqueness, and signed QR ticket support.

## Project Status

The implementation follows `plan.md`.

| Part | Area | Status |
|---|---|---|
| 1 | Planning and project orientation | Complete |
| 2 | Application scaffolding | Complete |
| 3 | Authentication and roles | Complete |
| 4 | Events, venues, and seat layouts | Complete |
| 5 | Database modeling | Complete |
| 6 | Atomic seat holds | Complete |
| 7 | Booking and test-mode payments | Complete |
| 8 | Real-time seat map | Complete |
| 9 | Tickets, dashboard, refunds, notifications | Complete |
| 10 | Waiting room and bot protection | Complete |
| 11 | Concurrency and load proof | Not started |
| 12 | Deployment and documentation | In progress |

## Features

### Attendees

- Register and sign in as an attendee.
- Browse published events.
- View venue sections and SVG seat maps.
- Select available seats.
- Create atomic Redis holds for up to eight seats.
- Check out held seats through a test-mode Razorpay order.
- Receive a signed ticket code for each confirmed seat.

### Organizers

- Register and sign in as an organizer.
- Create and update events.
- Configure venues, dates, demand status, seating sections, rows, and seats.
- Generate seat coordinates automatically.
- Create published or draft events.
- View events owned by the organizer.

### Platform Guarantees

- PostgreSQL is the source of truth for confirmed bookings.
- Redis holds are temporary and expire after five minutes.
- Multi-seat holds are all-or-nothing.
- `confirmed_seats(event_id, seat_id)` has a database unique constraint.
- Payment webhooks use HMAC signature verification.
- Duplicate webhook event IDs are ignored by the database.
- Money is stored as integers in the smallest currency unit.
- All state-changing request inputs are validated with Zod.

## Architecture

```text
Browser
  |
  | HTTP / Cookies
  v
Next.js Web App -----------------------------+
  |                                           |
  | REST API                                 |
  v                                           |
Fastify API                                    |
  |                                           |
  +--> PostgreSQL / Drizzle ORM               |
  |     Source of truth                       |
  |                                           |
  +--> Redis                                  |
  |     Temporary holds and pub/sub           |
  |                                           |
  +--> Razorpay Test Mode                     |
        Signed checkout and webhooks          |
                                                |
Postgres and Redis are isolated by Docker Compose
```

The web and API packages run as one pnpm workspace. PostgreSQL stores users,
events, layouts, bookings, confirmed seats, tickets, refunds, and webhook audit
records. Redis stores temporary seat holds and will also back real-time and
queue features in later parts.

## Technology Stack

- Frontend: Next.js 15, React 19, TypeScript, Tailwind CSS
- Backend: Fastify 5, Node.js, TypeScript
- Database: PostgreSQL 16, Drizzle ORM
- Temporary state: Redis 7
- Payment provider: Razorpay test mode
- Authentication: bcrypt passwords and signed HTTP-only cookie sessions
- Validation: Zod
- Testing: Vitest
- Formatting and linting: Biome
- Packaging: pnpm workspaces
- Local infrastructure: Docker Compose
- Real-time transport: Server-Sent Events with Redis pub/sub
- Future load testing: k6

## File Structure

```text
Event_Ticketing_Platform/
|-- AGENTS.md
|-- README.md
|-- plan.md
|-- package.json
|-- pnpm-lock.yaml
|-- pnpm-workspace.yaml
|-- biome.json
|-- docker-compose.yml
|-- docs/
|   |-- schema.json
|   `-- schema-rationale.md
|-- scripts/
|   |-- start.sh
|   |-- stop.sh
|   |-- start.bat
|   `-- stop.bat
`-- apps/
    |-- api/
    |   |-- Dockerfile
    |   |-- package.json
    |   |-- tsconfig.json
    |   |-- vitest.config.ts
    |   |-- drizzle.config.ts
    |   |-- .env.example
    |   |-- migrations/
    |   |   |-- 0000_concerned_warbound.sql
    |   |   |-- 0001_misty_wong.sql
    |   |   `-- meta/
    |   |-- src/
    |   |   |-- app.ts
    |   |   |-- config.ts
    |   |   |-- index.ts
    |   |   |-- db/
    |   |   |   |-- index.ts
    |   |   |   |-- schema.ts
    |   |   |   `-- seed.ts
    |   |   |-- middleware/
    |   |   |   `-- auth.ts
    |   |   |-- redis/
    |   |   |   `-- index.ts
    |   |   |-- routes/
    |   |   |   |-- auth.ts
    |   |   |   |-- events.ts
    |   |   |   |-- health.ts
    |   |   |   |-- holds.ts
    |   |   |   `-- payments.ts
    |   |   `-- services/
    |   |       |-- auth.ts
    |   |       |-- event.ts
    |   |       |-- seat-hold.ts
    |   |       `-- payment.ts
    |   `-- tests/
    |       |-- auth.test.ts
    |       |-- database.test.ts
    |       |-- events.test.ts
    |       |-- health.test.ts
    |       |-- seat-holds.test.ts
    |       `-- payments.test.ts
    `-- web/
        |-- Dockerfile
        |-- package.json
        |-- tsconfig.json
        |-- next.config.ts
        |-- postcss.config.mjs
        `-- src/
            |-- app/
            |   |-- layout.tsx
            |   |-- page.tsx
            |   |-- globals.css
            |   |-- login/page.tsx
            |   |-- register/page.tsx
            |   |-- events/[id]/page.tsx
            |   `-- organizer/
            |       |-- page.tsx
            |       `-- events/new/page.tsx
            |-- components/
            |   `-- navbar.tsx
            `-- context/
                `-- auth-context.tsx
```

## Prerequisites

Install the following:

- Node.js 22 or later
- pnpm 10 or later
- Docker Desktop, or native PostgreSQL 16 and Redis 7
- Optional Razorpay test credentials

## Local Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure the API

Copy `apps/api/.env.example` to `apps/api/.env`, then update it as needed.

```dotenv
PORT=4000
HOST=0.0.0.0
NODE_ENV=development
DATABASE_URL=postgres://localhost:5432/ticketing
REDIS_URL=redis://localhost:6379
SESSION_SECRET=super-secret-session-key-minimum-32-characters-required
FRONTEND_URL=http://localhost:3000
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
TICKET_SIGNING_SECRET=ticket-signing-secret-minimum-32-characters
```

Razorpay credentials are optional for local test checkout. When credentials are
missing, the API creates deterministic `test_order_*` order IDs. Set real test
credentials and a webhook secret only for a full Razorpay test integration.

### 3. Start infrastructure

macOS or Linux:

```bash
./scripts/start.sh
```

Windows:

```bat
scripts\start.bat
```

The scripts start Docker infrastructure when Docker is available and fall back
to native PostgreSQL and Redis. They then start the API and web development
servers.

Stop all services:

```bash
./scripts/stop.sh
```

Windows:

```bat
scripts\stop.bat
```

### 4. Open the application

- Web: http://localhost:3000
- API: http://localhost:4000
- Health: http://localhost:4000/health
- Mailpit: http://localhost:8025

## Docker Setup

Start only infrastructure containers:

```bash
docker compose up -d postgres redis mailpit
```

Run the complete application stack:

```bash
docker compose up --build
```

Stop and remove containers:

```bash
docker compose down
```

Docker Compose provides PostgreSQL on port `5432`, Redis on `6379`, and Mailpit
on SMTP port `1025` and web port `8025`.

## Database

Generate a migration after changing Drizzle schema definitions:

```bash
pnpm db:generate
```

Apply migrations:

```bash
pnpm db:migrate
```

Seed the initial organizer and sample multi-tier event:

```bash
pnpm db:seed
```

The seed credentials are:

- Email: `organizer@example.com`
- Password: `OrganizerPassword123`

## API Overview

### Health

| Method | Endpoint | Access |
|---|---|---|
| GET | `/health` | Public |

### Authentication

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/auth/register` | Public |
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/logout` | Public |
| GET | `/api/auth/me` | Authenticated |

Supported roles:

- `attendee`
- `organizer`

### Events

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/events` | Public |
| GET | `/api/events/:id` | Public |
| POST | `/api/events` | Organizer |
| PUT | `/api/events/:id` | Event organizer |
| GET | `/api/organizer/events` | Organizer |
| POST | `/api/events/seed-demo` | Authenticated |

### Seat Holds

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/events/:id/availability` | Public |
| POST | `/api/events/:id/holds` | Authenticated |
| GET | `/api/events/:id/holds/:holdId` | Hold owner |
| DELETE | `/api/events/:id/holds/:holdId` | Hold owner |

A hold accepts one to eight seat IDs and expires after five minutes.

### Payments

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/bookings/checkout` | Authenticated hold owner |
| POST | `/api/payments/webhook` | Razorpay webhook |

The webhook endpoint requires `x-razorpay-signature` containing the HMAC-SHA256
signature generated from the exact raw request body and the configured webhook
secret.

## Database Schema

The approved relational schema is documented in:

- `docs/schema.json`
- `docs/schema-rationale.md`

Core tables:

| Table | Purpose |
|---|---|
| `users` | Attendee and organizer accounts |
| `sessions` | Server-side cookie sessions |
| `events` | Event details and demand status |
| `sections` | Layout sections and integer price tiers |
| `seats` | Individual generated seat coordinates |
| `bookings` | Pending and confirmed purchases |
| `confirmed_seats` | Final seat ownership and double-booking protection |
| `tickets` | QR ticket records |
| `refunds` | Refund audit records |
| `webhook_events` | Idempotent payment webhook events |

The critical invariant is:

```sql
UNIQUE (event_id, seat_id)
```

on `confirmed_seats`. PostgreSQL prevents a second confirmed booking for the same
seat even if the Redis hold layer is bypassed or fails.

## Testing

Run the API test suite:

```bash
pnpm test
```

The current suite includes:

- Authentication and role guards
- Health checks
- Event and layout generation
- Database migration and duplicate-seat protection
- Atomic seat hold behavior
- Hold TTL and ownership
- Checkout
- Captured and failed payment webhooks
- Webhook replay protection
- Invalid webhook signatures

Build all applications:

```bash
pnpm build
```

Run lint and formatting checks:

```bash
pnpm lint
pnpm format
```

End-to-end and k6 scripts are placeholders until Parts 8 and 11:

```bash
pnpm test:e2e
pnpm test:load
```

## Seat State and Accessibility

The seat map uses these fixed states:

| State | Color | Visual indicator |
|---|---|---|
| Available | `#334155` | Light border |
| Selected | `#6366F1` | Checkmark |
| Held | `#F59E0B` | Hourglass |
| Sold | `#475569` | Cross and reduced opacity |

Seat controls include keyboard selection and text labels so state is not
communicated by color alone.

## Implementation Limits

The MVP does not implement:

- Dynamic pricing
- NFT tickets
- Multi-currency payments
- Native mobile applications
- Localization
- Drag-and-drop seat layout editing
- Tickets and venue scanning
- Refund operations
- Waiting-room queues
- Bot protection
- k6 load proof
- Production deployment

These features remain in `plan.md` for later implementation parts.

## Development Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Start API and web development servers |
| `pnpm dev:api` | Start only the API |
| `pnpm dev:web` | Start only the web app |
| `pnpm build` | Build API and web apps |
| `pnpm test` | Run API Vitest suite |
| `pnpm lint` | Run Biome checks |
| `pnpm format` | Format the workspace |
| `pnpm db:generate` | Generate a Drizzle migration |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:seed` | Seed organizer and sample event |
| `pnpm test:e2e` | Reserved for Playwright tests |
| `pnpm test:load` | Reserved for k6 tests |

## Contributing and Workflow

- Work through `plan.md` one part at a time.
- Parts 1 and 5 require explicit sign-off.
- Each part must pass its tests and success criteria before the next part starts.
- Keep PostgreSQL data authoritative.
- Keep Redis limited to temporary state.
- Store money as integers.
- Add focused tests for every state-changing feature.
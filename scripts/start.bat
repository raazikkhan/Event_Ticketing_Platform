@echo off
echo Starting Event Ticketing Platform...

where docker >nul 2>nul
if %ERRORLEVEL% equ 0 (
  echo Starting docker compose services...
  docker compose up -d postgres redis mailpit
) else (
  echo Please ensure PostgreSQL and Redis are running locally on ports 5432 and 6379.
)

set PORT=4000
set DATABASE_URL=postgres://postgres:postgrespassword@localhost:5432/ticketing
set REDIS_URL=redis://localhost:6379
set SESSION_SECRET=super-secret-session-key-minimum-32-characters-required
set NEXT_PUBLIC_API_URL=http://localhost:4000

echo Starting development servers...
pnpm dev

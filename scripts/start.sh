#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "Starting Event Ticketing Platform..."

# 1. Check if Docker is running
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "Docker detected. Starting containerized dependencies (PostgreSQL, Redis, Mailpit)..."
  docker compose up -d postgres redis mailpit
else
  echo "Docker not available. Checking native local services..."

  # Start Redis if not already active
  if command -v redis-cli >/dev/null 2>&1 && redis-cli ping >/dev/null 2>&1; then
    echo "Redis is already running."
  elif [ -x "/opt/homebrew/opt/redis/bin/redis-server" ]; then
    echo "Starting native Redis server..."
    /opt/homebrew/opt/redis/bin/redis-server --daemonize yes
  elif command -v brew >/dev/null 2>&1; then
    brew services start redis || true
  fi

  # Start PostgreSQL if not already active
  PG_BIN="/opt/homebrew/opt/postgresql@16/bin"
  if [ -d "$PG_BIN" ]; then
    export PATH="$PG_BIN:$PATH"
  fi

  if command -v pg_isready >/dev/null 2>&1 && pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
    echo "PostgreSQL is already running."
  elif [ -x "$PG_BIN/pg_ctl" ] && [ -d "/opt/homebrew/var/postgresql@16" ]; then
    echo "Starting native PostgreSQL 16..."
    "$PG_BIN/pg_ctl" -D "/opt/homebrew/var/postgresql@16" -l "$DIR/.pg.log" start || true
  elif command -v brew >/dev/null 2>&1; then
    brew services start postgresql@16 || true
  fi

  # Ensure database 'ticketing' exists
  if command -v createdb >/dev/null 2>&1; then
    createdb -h localhost -p 5432 ticketing 2>/dev/null || true
  fi
fi

# Export default environment variables if not defined
export PORT="${PORT:-4000}"
export DATABASE_URL="${DATABASE_URL:-postgres://localhost:5432/ticketing}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export SESSION_SECRET="${SESSION_SECRET:-super-secret-session-key-minimum-32-characters-required}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:4000}"

echo "Starting Fastify API and Next.js Web dev servers..."
exec pnpm dev

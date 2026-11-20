#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "Stopping Event Ticketing Platform..."

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker compose down
fi

# Stop any running native servers if started by us
PG_BIN="/opt/homebrew/opt/postgresql@16/bin"
if [ -x "$PG_BIN/pg_ctl" ] && [ -d "/opt/homebrew/var/postgresql@16" ]; then
  "$PG_BIN/pg_ctl" -D "/opt/homebrew/var/postgresql@16" stop -m fast 2>/dev/null || true
fi

if command -v redis-cli >/dev/null 2>&1; then
  redis-cli shutdown nosave 2>/dev/null || true
fi

# Kill any stray dev server processes on ports 3000 and 4000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:4000 | xargs kill -9 2>/dev/null || true

echo "All services stopped."

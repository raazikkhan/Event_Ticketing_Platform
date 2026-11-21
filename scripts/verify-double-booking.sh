#!/usr/bin/env bash
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgrespassword@localhost:5432/ticketing}"
EVENT_ID="${LOAD_EVENT_ID:-}"
SEAT_ID="${LOAD_SEAT_ID:-}"

if [[ -z "$EVENT_ID" || -z "$SEAT_ID" ]]; then
  echo "Set LOAD_EVENT_ID and LOAD_SEAT_ID before running verification."
  exit 1
fi

duplicates="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "
  SELECT COUNT(*)
  FROM (
    SELECT seat_id, COUNT(*) AS confirmed_count
    FROM confirmed_seats
    WHERE event_id = '$EVENT_ID'
    GROUP BY seat_id
    HAVING COUNT(*) > 1
  ) duplicate_seats;
")"

target_confirmed="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "
  SELECT COUNT(*)
  FROM confirmed_seats
  WHERE event_id = '$EVENT_ID' AND seat_id = '$SEAT_ID';
")"

echo "duplicate_confirmed_seats=$duplicates"
echo "target_seat_confirmed_count=$target_confirmed"

if [[ "$duplicates" != "0" ]]; then
  echo "FAIL: duplicate confirmed seats detected"
  exit 1
fi

if [[ "$target_confirmed" != "1" ]]; then
  echo "FAIL: target seat confirmation count must be exactly 1"
  exit 1
fi

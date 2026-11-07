#!/bin/sh
# Runs tests/concurrency against a throwaway local PostgreSQL server (needs PostgreSQL installed, e.g. `brew install postgresql@17`).
# The server lives in a temp folder and is deleted afterwards; nothing touches the Supabase database.
set -e
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || echo /opt/homebrew/opt/postgresql@17/bin/pg_ctl)")}"
PORT="${PG_TEST_PORT:-54329}"
DIR="$(mktemp -d)"
"$PG_BIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=localhost" -l "$DIR/log" -w start >/dev/null
trap '"$PG_BIN/pg_ctl" -D "$DIR/data" -m fast stop >/dev/null; rm -rf "$DIR"' EXIT
PG_TEST_URL="postgres://postgres@localhost:$PORT/postgres" npx vitest run tests/concurrency

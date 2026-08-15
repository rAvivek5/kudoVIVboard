#!/usr/bin/env bash
#
# Applies every migration to a throwaway Postgres and runs the 40-assertion
# security suite against it. Validates the SQL and the RLS policies without
# needing Docker or a Supabase project: supabase/tests/stubs.sql stands in for
# the auth and storage schemas that Supabase manages for you.
#
#   PGURL=postgres://postgres@localhost:5432 ./scripts/verify-db.sh
#
set -euo pipefail

PGURL="${PGURL:-postgres://postgres@localhost:5432}"
DB="${VERIFY_DB:-hypewall_verify}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Recreating $DB"
psql "$PGURL/postgres" -v ON_ERROR_STOP=1 -q \
  -c "drop database if exists $DB;" \
  -c "create database $DB;"

echo "==> Applying local stubs"
psql "$PGURL/$DB" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/stubs.sql"

echo "==> Applying migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "    $(basename "$f")"
  psql "$PGURL/$DB" -v ON_ERROR_STOP=1 -q -f "$f"
done

echo "==> Running the security suite"
psql "$PGURL/$DB" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/rls_test.sql"

echo "==> Cleaning up"
psql "$PGURL/postgres" -q -c "drop database if exists $DB;"

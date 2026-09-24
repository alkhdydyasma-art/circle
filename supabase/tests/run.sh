#!/usr/bin/env bash
# Runs the tenant-isolation tests on a throwaway Postgres database.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
db=circle_portal_test
psql -qc "drop database if exists $db" -c "create database $db" >/dev/null
q=(psql -d "$db" -qX -v ON_ERROR_STOP=1 --set=client_min_messages=warning)
"${q[@]}" -c "do \$\$ begin create role anon; exception when duplicate_object then null; end \$\$;
              do \$\$ begin create role authenticated; exception when duplicate_object then null; end \$\$;"
PGOPTIONS='-c client_min_messages=warning' "${q[@]}" -f tests/auth_stub.sql
for f in migrations/*.sql; do PGOPTIONS='-c client_min_messages=warning' "${q[@]}" -f "$f"; done
PGOPTIONS='-c client_min_messages=notice' psql -d "$db" -qXt -v ON_ERROR_STOP=1 -f tests/rls_test.sql 2>&1 \
  | sed -n 's/.*NOTICE:  //p; /PASSED/p; /ERROR/p'

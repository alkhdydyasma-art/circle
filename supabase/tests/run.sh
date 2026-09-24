#!/usr/bin/env bash
# Runs every tests/*_test.sql on its own throwaway Postgres database:
# auth stub → all migrations → test file. Any failed check aborts with an error.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
for test in tests/*_test.sql; do
  db="circle_$(basename "$test" .sql)"
  psql -qX -c "drop database if exists $db" -c "create database $db" >/dev/null 2>&1
  q=(psql -d "$db" -qX -v ON_ERROR_STOP=1)
  for r in anon authenticated; do
    "${q[@]}" -c "do \$\$ begin create role $r; exception when duplicate_object then null; end \$\$;" 2>/dev/null
  done
  for f in tests/auth_stub.sql migrations/*.sql; do
    PGOPTIONS='-c client_min_messages=warning' "${q[@]}" -f "$f"
  done
  echo "── $test"
  "${q[@]}" -t -f "$test" 2>&1 | sed -n 's/.*NOTICE:  //p; /PASSED/p; /ERROR/p; /FAIL/p'
  psql -qX -c "drop database $db" >/dev/null
done

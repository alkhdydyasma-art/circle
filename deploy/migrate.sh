#!/usr/bin/env bash
# Applies supabase/migrations/*.sql that haven't run yet, in order, each in one transaction.
# Applied files are recorded in circle.schema_migrations (a schema the public API doesn't expose).
. "$(dirname "$0")/lib.sh"

psql_db <<'SQL'
create schema if not exists circle;
revoke all on schema circle from public;
create table if not exists circle.schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
SQL

applied="$(psql_db -At -c 'select name from circle.schema_migrations')"
count=0
for file in "$APP_DIR"/supabase/migrations/*.sql; do
  name="$(basename "$file")"
  grep -qxF "$name" <<<"$applied" && continue
  log "Applying $name"
  { echo 'set client_min_messages = warning;'; echo 'begin;'; cat "$file"; echo; echo "insert into circle.schema_migrations (name) values ('$name');"; echo 'commit;'; } \
    | psql_db
  count=$((count + 1))
done
log "Migrations up to date ($count applied now)"

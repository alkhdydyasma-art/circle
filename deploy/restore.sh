#!/usr/bin/env bash
# Restores a backup made by backup.sh onto this server (same or a freshly installed one):
#   sudo bash deploy/restore.sh /opt/circle/backups/circle-YYYYMMDD-HHMMSS.tar.age [age-key-file]
# Replaces ALL Circle data (clinics, patients, appointments, accounts) with the backup's.
. "$(dirname "$0")/lib.sh"
load_conf

file="${1:?usage: restore.sh <backup.tar.age> [key-file]}"
key="${2:-$BACKUP_KEY}"
[ -f "$file" ] || die "$file not found"
[ -f "$key" ] || die "Key $key not found (paste your saved backup key into a file and pass its path)"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
age -d -i "$key" "$file" | tar -C "$work" -xf - || die "Could not decrypt $file with $key"
cat "$work/manifest"

current="$(psql_db -At -c 'select max(name) from circle.schema_migrations')"
wanted="$(env_get "$work/manifest" last_migration)"
[ "$current" = "$wanted" ] || die "Database schema is at '$current' but the backup is at '$wanted'.
  Check out the backup's code first:  git -C $APP_DIR checkout $(env_get "$work/manifest" app_commit)
  then run deploy/deploy.sh --no-pull, and restore again."

if [ "${RESTORE_YES:-}" != 1 ]; then
  read -r -p "This REPLACES all Circle data on $(hostname). Type RESTORE to continue: " answer
  [ "$answer" = RESTORE ] || die "Cancelled"
fi

log "Stopping the app and n8n"
dc stop app n8n

log "Restoring the database"
# Schema comes from the migrations; the backup provides the rows. Supabase's own
# migration bookkeeping stays as installed.
docker exec -i "$DB_CONTAINER" sh -c 'cat > /tmp/circle-restore.dump' < "$work/db.dump"
docker exec "$DB_CONTAINER" sh -c 'pg_restore -l /tmp/circle-restore.dump' \
  | grep ' TABLE DATA ' \
  | grep -vE ' (auth|storage|circle) (schema_migrations|migrations) ' > "$work/restore.list"
docker exec -i "$DB_CONTAINER" sh -c 'cat > /tmp/circle-restore.list' < "$work/restore.list"
PSQL_USER=supabase_admin psql_db <<'SQL'
do $$
declare t text;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ') into t
  from pg_tables
  where schemaname in ('public', 'auth', 'storage')
    and tablename not in ('schema_migrations', 'migrations');
  if t is not null then execute 'truncate ' || t || ' cascade'; end if;
end $$;
SQL
docker exec "$DB_CONTAINER" pg_restore -U supabase_admin -d postgres --data-only --disable-triggers \
  --exit-on-error -L /tmp/circle-restore.list /tmp/circle-restore.dump
docker exec "$DB_CONTAINER" rm -f /tmp/circle-restore.dump /tmp/circle-restore.list

log "Restoring n8n data and uploaded files"
# n8n's saved credentials are encrypted with the backup's key: keep using it.
env_set "$SB_DIR/.env" N8N_ENCRYPTION_KEY "$(env_get "$work/supabase.env" N8N_ENCRYPTION_KEY)"
docker cp - circle-n8n:/home/node/ < "$work/n8n.tar"
[ -f "$work/storage.tar" ] && tar -C "$SB_DIR/volumes" -xf "$work/storage.tar"

log "Starting"
dc up -d --wait app n8n
log "Restore complete. Check: https://$DOMAIN/api/health"

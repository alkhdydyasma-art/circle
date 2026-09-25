#!/usr/bin/env bash
# Nightly backup (cron, 03:30 Riyadh): database, n8n, uploaded files and settings →
# one archive encrypted with age → /opt/circle/backups (+ Oracle Object Storage, Riyadh).
. "$(dirname "$0")/lib.sh"
load_conf

[ -f "$BACKUP_KEY" ] || die "No backup key at $BACKUP_KEY (run install.sh)"
ts="$(date +%Y%m%d-%H%M%S)"
out="$BACKUP_DIR/circle-$ts.tar.age"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fail() { bash "$APP_DIR/deploy/alert.sh" "Circle backup FAILED on $(hostname): $*" || true; die "$*"; }

log "Dumping the database"
docker exec "$DB_CONTAINER" pg_dump -U supabase_admin -d postgres -Fc \
  -n public -n circle -n auth -n storage \
  --exclude-table-data=public.rate_limits > "$work/db.dump" || fail "pg_dump"

log "Copying n8n data"
docker cp circle-n8n:/home/node/.n8n - > "$work/n8n.tar" 2>/dev/null || fail "n8n data"

[ -d "$SB_DIR/volumes/storage" ] && tar -C "$SB_DIR/volumes" -cf "$work/storage.tar" storage
cp "$SB_DIR/.env" "$work/supabase.env"
cp "$CONF" "$work/circle.conf"
{
  echo "created=$ts"
  echo "app_commit=$(git -C "$APP_DIR" rev-parse HEAD)"
  echo "last_migration=$(psql_db -At -c 'select max(name) from circle.schema_migrations')"
  echo "supabase_ref=$(env_get "$SB_DIR/.supabase-version" ref)"
} > "$work/manifest"

recipient="$(age-keygen -y "$BACKUP_KEY")"
tar -C "$work" -cf - . | age -r "$recipient" > "$out.part" || fail "encrypt"
mv "$out.part" "$out"
chmod 600 "$out"
log "Saved $out ($(du -h "$out" | cut -f1))"

find "$BACKUP_DIR" -name 'circle-*.tar.age' -mtime +"${BACKUP_KEEP_LOCAL_DAYS:-7}" -delete

if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
  export RCLONE_CONFIG_OCI_TYPE=s3 RCLONE_CONFIG_OCI_PROVIDER=Other \
    RCLONE_CONFIG_OCI_ENDPOINT="$BACKUP_S3_ENDPOINT" RCLONE_CONFIG_OCI_REGION="$BACKUP_S3_REGION" \
    RCLONE_CONFIG_OCI_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY" RCLONE_CONFIG_OCI_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY" \
    RCLONE_CONFIG_OCI_FORCE_PATH_STYLE=true RCLONE_CONFIG_OCI_NO_CHECK_BUCKET=true RCLONE_CONFIG=/dev/null
  log "Uploading to $BACKUP_S3_BUCKET"
  rclone copy --retries 3 "$out" "oci:$BACKUP_S3_BUCKET/daily/" || fail "upload to object storage"
  rclone delete --min-age "${BACKUP_KEEP_REMOTE_DAYS:-35}d" "oci:$BACKUP_S3_BUCKET/daily/" || warn "remote cleanup failed"
fi

date +%s > "$STATE_DIR/last-backup"
log "Backup done"

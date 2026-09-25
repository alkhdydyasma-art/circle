#!/usr/bin/env bash
# Ship the latest code: backup → pull → build → migrate → restart the app.
#   sudo bash /opt/circle/app/deploy/deploy.sh            (use --no-pull to deploy what is checked out)
. "$(dirname "$0")/lib.sh"
load_conf

bash "$APP_DIR/deploy/backup.sh"
if [ "${1:-}" != "--no-pull" ]; then
  log "Pulling ${REPO_BRANCH:-main}"
  git -C "$APP_DIR" pull --ff-only origin "${REPO_BRANCH:-main}"
fi
log "Building the app"
dc build app
bash "$APP_DIR/deploy/migrate.sh"
dc up -d --wait app caddy n8n
log "Deployed $(git -C "$APP_DIR" log -1 --format='%h %s')"

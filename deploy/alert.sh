#!/usr/bin/env bash
# alert.sh "message" → POST {"text": message} to ALERT_WEBHOOK_URL (if set) and syslog.
. "$(dirname "$0")/lib.sh"
load_conf
logger -t circle "$1" || true
[ -n "${ALERT_WEBHOOK_URL:-}" ] || exit 0
curl -fsS -m 15 -X POST "$ALERT_WEBHOOK_URL" -H 'Content-Type: application/json' \
  -d "$(jq -n --arg t "$1" '{text: $t}')" >/dev/null

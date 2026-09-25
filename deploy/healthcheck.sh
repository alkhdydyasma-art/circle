#!/usr/bin/env bash
# Every 5 minutes (cron): site reachable over HTTPS, containers healthy, disk space,
# last backup age. Alerts once when something breaks and once when it recovers.
. "$(dirname "$0")/lib.sh"
load_conf

problems=()
code="$(curl -sk -o /dev/null -w '%{http_code}' -m 15 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/health" || true)"
[ "$code" = 200 ] || problems+=("site health returned ${code:-no answer}")

bad="$(docker ps -a --filter 'name=^(supabase|circle)-' --format '{{.Names}} {{.Status}}' \
  | grep -E 'unhealthy|Exited|Restarting' | cut -d' ' -f1 | paste -sd, - || true)"
[ -z "$bad" ] || problems+=("containers: $bad")

disk="$(df --output=pcent / | tail -1 | tr -dc 0-9)"
[ "$disk" -lt 85 ] || problems+=("disk ${disk}% full")

if [ -f "$STATE_DIR/last-backup" ]; then
  age_h=$(( ($(date +%s) - $(cat "$STATE_DIR/last-backup")) / 3600 ))
  [ "$age_h" -lt 26 ] || problems+=("last backup ${age_h}h ago")
fi

state_file="$STATE_DIR/health"
previous="$(cat "$state_file" 2>/dev/null || echo ok)"
if [ ${#problems[@]} -eq 0 ]; then
  echo ok > "$state_file"
  [ "$previous" = ok ] || bash "$APP_DIR/deploy/alert.sh" "✅ Circle recovered on $(hostname)"
else
  summary="$(printf '%s; ' "${problems[@]}")"; summary="${summary%; }"
  echo "$(date -Is) $summary"
  if [ "$previous" != "$summary" ]; then
    echo "$summary" > "$state_file"
    bash "$APP_DIR/deploy/alert.sh" "⚠️ Circle problem on $(hostname): $summary"
  fi
fi

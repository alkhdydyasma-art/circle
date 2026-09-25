#!/usr/bin/env bash
# Status and recent logs:  sudo bash deploy/logs.sh [service]   (app, n8n, caddy, auth, rest, db, …)
. "$(dirname "$0")/lib.sh"
dc ps --format 'table {{.Service}}\t{{.Status}}'
[ -n "${1:-}" ] && dc logs --tail 200 "$1"
exit 0

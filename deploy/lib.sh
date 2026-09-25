# shellcheck shell=bash disable=SC2034
# Shared helpers for the Circle deployment scripts. Sourced, not executed.
# Layout on the server:
#   /opt/circle/app        this repository (git clone)
#   /opt/circle/supabase   self-hosted Supabase (official docker setup) + Circle's compose override
#   /opt/circle/backups    local encrypted backups
#   /opt/circle/circle.conf  your settings (domain, email, backups) — see deploy/circle.conf.example

set -euo pipefail

CIRCLE_ROOT="${CIRCLE_ROOT:-/opt/circle}"
APP_DIR="$CIRCLE_ROOT/app"
SB_DIR="$CIRCLE_ROOT/supabase"
BACKUP_DIR="$CIRCLE_ROOT/backups"
CONF="$CIRCLE_ROOT/circle.conf"
BACKUP_KEY="$CIRCLE_ROOT/backup-key.txt"   # age identity; keep an offline copy!
STATE_DIR="$CIRCLE_ROOT/state"
DB_CONTAINER="supabase-db"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWARNING:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

load_conf() {
  [ -f "$CONF" ] || die "$CONF not found. Copy deploy/circle.conf.example there and fill it in."
  set -a
  # shellcheck disable=SC1090
  . "$CONF"
  set +a
  : "${DOMAIN:?set DOMAIN in circle.conf}" "${N8N_DOMAIN:?set N8N_DOMAIN in circle.conf}"
}

# docker compose for the whole stack (Supabase + Circle override), run from the project dir
# so COMPOSE_FILE and the variables in supabase/.env apply.
dc() { (cd "$SB_DIR" && docker compose "$@"); }

# psql inside the database container. Runs as `postgres`, the same role the Supabase
# dashboard's SQL editor uses, so objects created by migrations stay editable there.
psql_db() { docker exec -i "$DB_CONTAINER" psql -U "${PSQL_USER:-postgres}" -d postgres -v ON_ERROR_STOP=1 -qX "$@"; }

# Read / write KEY=value lines in a dotenv file.
env_get() { grep -E "^$2=" "$1" 2>/dev/null | head -n1 | cut -d= -f2- || true; }
env_set() {
  local file="$1" key="$2" val="$3" tmp
  tmp="$(mktemp)"
  if grep -qE "^$key=" "$file"; then
    K="$key" V="$val" awk 'BEGIN{FS="="} $1==ENVIRON["K"] {print ENVIRON["K"] "=" ENVIRON["V"]; next} {print}' "$file" > "$tmp"
  else
    cat "$file" > "$tmp"; printf '%s=%s\n' "$key" "$val" >> "$tmp"
  fi
  cat "$tmp" > "$file"; rm -f "$tmp"
}
# Set only if missing or empty (for generated secrets that must never change).
env_default() { [ -n "$(env_get "$1" "$2")" ] || env_set "$1" "$2" "$3"; }

rand_hex() { openssl rand -hex "${1:-32}"; }

wait_healthy() {
  local url="$1" tries="${2:-60}"
  for _ in $(seq "$tries"); do curl -fsS -o /dev/null "$url" 2>/dev/null && return 0; sleep 2; done
  return 1
}

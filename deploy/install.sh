#!/usr/bin/env bash
# One-time server setup for Circle on Ubuntu 22.04/24.04 (Oracle Cloud, Riyadh). Safe to re-run.
#
#   sudo mkdir -p /opt/circle && sudo cp deploy/circle.conf.example /opt/circle/circle.conf
#   sudo nano /opt/circle/circle.conf
#   sudo bash deploy/install.sh
#
# Options: --skip-host  don't touch the OS (packages, firewall, swap) — for testing.
. "$(dirname "$0")/lib.sh"

SKIP_HOST=0
[ "${1:-}" = "--skip-host" ] && SKIP_HOST=1
[ "$(id -u)" = 0 ] || die "Run as root: sudo bash deploy/install.sh"
load_conf
mkdir -p "$CIRCLE_ROOT" "$BACKUP_DIR" "$STATE_DIR"
chmod 700 "$CIRCLE_ROOT"; chmod 600 "$CONF"

# ── 1. Operating system ──────────────────────────────────────────────────────
if [ "$SKIP_HOST" = 0 ]; then
  log "Updating the system and installing tools"
  export DEBIAN_FRONTEND=noninteractive
  timedatectl set-timezone Asia/Riyadh || true
  apt-get update -qq
  apt-get upgrade -qq -y
  apt-get install -qq -y git curl jq openssl age rclone cron fail2ban unattended-upgrades ca-certificates
  dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null
  systemctl enable --now fail2ban cron >/dev/null
  systemctl restart cron   # pick up the new time zone

  # Cap container logs so they can't fill the disk.
  if [ ! -f /etc/docker/daemon.json ]; then
    mkdir -p /etc/docker
    echo '{"log-driver": "json-file", "log-opts": {"max-size": "10m", "max-file": "3"}}' > /etc/docker/daemon.json
    systemctl is-active --quiet docker && systemctl restart docker
  fi
  cat > /etc/logrotate.d/circle <<'ROT'
/var/log/circle-*.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
}
ROT

  if ! swapon --show | grep -q .; then
    log "Adding 4 GB swap"
    fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi

  # Oracle's Ubuntu images only allow SSH in iptables; open HTTP/HTTPS (also open them in the
  # VCN security list — see deploy/README.md).
  if command -v netfilter-persistent >/dev/null; then
    for rule in "-p tcp --dport 80" "-p tcp --dport 443" "-p udp --dport 443"; do
      # shellcheck disable=SC2086
      iptables -C INPUT -m state --state NEW $rule -j ACCEPT 2>/dev/null \
        || iptables -I INPUT 5 -m state --state NEW $rule -j ACCEPT
    done
    netfilter-persistent save >/dev/null
  fi
fi

# ── 2. Code ──────────────────────────────────────────────────────────────────
if [ ! -d "$APP_DIR/.git" ]; then
  log "Cloning $REPO_URL"
  git clone -q --branch "${REPO_BRANCH:-main}" "$REPO_URL" "$APP_DIR"
fi

# ── 3. Supabase (official self-hosted setup, pinned release) ─────────────────
if [ ! -f "$SB_DIR/.env" ]; then
  log "Installing self-hosted Supabase ${SUPABASE_REF}"
  setup_args=(-y --ref "$SUPABASE_REF" --project-dir supabase)
  [ "$SKIP_HOST" = 1 ] && setup_args+=(--skip-deps)
  curl -fsSL "https://raw.githubusercontent.com/supabase/supabase/${SUPABASE_REF}/docker/setup.sh" -o /tmp/supabase-setup.sh
  (cd "$CIRCLE_ROOT" && sh /tmp/supabase-setup.sh "${setup_args[@]}")
  rm -f /tmp/supabase-setup.sh
fi
command -v docker >/dev/null || die "Docker is missing (the Supabase setup should have installed it)."

log "Configuring Supabase and Circle"
E="$SB_DIR/.env"
ln -sf "$APP_DIR/deploy/docker-compose.circle.yml" "$SB_DIR/docker-compose.circle.yml"
env_set "$E" COMPOSE_FILE docker-compose.yml:docker-compose.circle.yml
env_set "$E" SUPABASE_PUBLIC_URL "https://$DOMAIN"
env_set "$E" API_EXTERNAL_URL "https://$DOMAIN/auth/v1"
env_set "$E" SITE_URL "https://$DOMAIN"
env_set "$E" ADDITIONAL_REDIRECT_URLS "https://$DOMAIN/auth/callback**"
env_set "$E" DISABLE_SIGNUP true               # accounts only come from Circle invitations
env_set "$E" ENABLE_PHONE_SIGNUP false
env_set "$E" ENABLE_ANONYMOUS_USERS false
env_set "$E" ENABLE_EMAIL_AUTOCONFIRM false
env_set "$E" STUDIO_DEFAULT_ORGANIZATION Circle
env_set "$E" STUDIO_DEFAULT_PROJECT Circle
env_set "$E" OPENAI_API_KEY ""
if [ -n "${SMTP_HOST:-}" ]; then
  env_set "$E" SMTP_HOST "$SMTP_HOST"
  env_set "$E" SMTP_PORT "${SMTP_PORT:-587}"
  env_set "$E" SMTP_USER "$SMTP_USER"
  env_set "$E" SMTP_PASS "$SMTP_PASS"
  env_set "$E" SMTP_ADMIN_EMAIL "$SMTP_SENDER_EMAIL"
  env_set "$E" SMTP_SENDER_NAME "${SMTP_SENDER_NAME:-Circle}"
else
  warn "SMTP not set: password-reset emails won't be sent until you fill SMTP_* and re-run install.sh."
fi
env_set "$E" CIRCLE_APP_DIR "$APP_DIR"
env_set "$E" DOMAIN "$DOMAIN"
env_set "$E" N8N_DOMAIN "$N8N_DOMAIN"
env_set "$E" ACME_EMAIL "${ACME_EMAIL:-}"
env_default "$E" RATE_LIMIT_SALT "$(rand_hex 32)"
env_default "$E" N8N_ENCRYPTION_KEY "$(rand_hex 32)"
env_default "$E" N8N_WEBHOOK_SECRET "$(rand_hex 24)"
env_default "$E" N8N_BOOKING_WEBHOOK_URL ""
env_default "$E" N8N_LEAD_WEBHOOK_URL ""
env_default "$E" WHATSAPP_PHONE_NUMBER_ID ""
chmod 600 "$E"

# ── 4. Start ─────────────────────────────────────────────────────────────────
log "Pulling images and building the Circle app (first run takes a few minutes)"
dc pull --quiet --ignore-buildable || warn "Some images could not be pulled now; trying to start with what is available."
dc build app
dc up -d --wait --wait-timeout 300 || { dc ps; die "Some services did not become healthy (see: sudo bash $APP_DIR/deploy/logs.sh)"; }

log "Database migrations"
bash "$APP_DIR/deploy/migrate.sh"

if [ -n "${ADMIN_EMAIL:-}" ] && [ ! -f "$STATE_DIR/admin-created" ]; then
  bash "$APP_DIR/deploy/create-admin.sh" "$ADMIN_EMAIL" && touch "$STATE_DIR/admin-created"
fi

# ── 5. Backups, health checks ────────────────────────────────────────────────
if [ ! -f "$BACKUP_KEY" ]; then
  command -v age-keygen >/dev/null || die "age is not installed (apt-get install age)"
  age-keygen -o "$BACKUP_KEY" 2>/dev/null && chmod 600 "$BACKUP_KEY"
  NEW_BACKUP_KEY=1
fi
cat > /etc/cron.d/circle <<CRON
# Circle maintenance (server time zone: Asia/Riyadh)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 3 * * * root bash $APP_DIR/deploy/backup.sh >> /var/log/circle-backup.log 2>&1
*/5 * * * * root bash $APP_DIR/deploy/healthcheck.sh >> /var/log/circle-health.log 2>&1
CRON

# ── Done ─────────────────────────────────────────────────────────────────────
cat <<DONE

  Circle is running.
    Site & dashboard   https://$DOMAIN/ar        (sign in: https://$DOMAIN/ar/login)
    n8n                https://$N8N_DOMAIN       (create the owner account on first visit)
    Supabase Studio    from your computer:  ssh -L 8000:127.0.0.1:8000 ubuntu@<server-ip>
                       then open http://localhost:8000  (user/password: sudo bash $SB_DIR/run.sh secrets)

DONE
if [ "${NEW_BACKUP_KEY:-0}" = 1 ]; then
  cat <<KEY
  IMPORTANT — backup decryption key. Save it now in your password manager; without it
  the backups cannot be restored if this server is lost:

$(cat "$BACKUP_KEY")

KEY
fi

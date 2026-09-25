#!/usr/bin/env bash
# Creates a Circle staff (platform admin) account: create-admin.sh email [password]
# Without a password, a random one is generated and printed once.
. "$(dirname "$0")/lib.sh"

email="${1:?usage: create-admin.sh email [password]}"
password="${2:-$(openssl rand -base64 18 | tr -d '/+=')}"
service_key="$(env_get "$SB_DIR/.env" SERVICE_ROLE_KEY)"

body="$(jq -n --arg e "$email" --arg p "$password" '{email: $e, password: $p, email_confirm: true}')"
status="$(curl -sS -o /tmp/circle-admin.json -w '%{http_code}' -X POST http://127.0.0.1:8000/auth/v1/admin/users \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key" -H 'Content-Type: application/json' -d "$body")"
case "$status" in
  200|201) created=1 ;;
  422) created=0; warn "$email already has an account; keeping its password." ;;
  *) cat /tmp/circle-admin.json >&2; rm -f /tmp/circle-admin.json; die "Could not create the user (HTTP $status)" ;;
esac
rm -f /tmp/circle-admin.json

psql_db -v email="$email" <<'SQL'
insert into public.platform_admins (user_id)
select id from auth.users where email = lower(:'email')
on conflict do nothing;
SQL
log "$email is a Circle admin."
[ "$created" = 1 ] && [ -z "${2:-}" ] && printf '\n  Sign-in password (shown once, change it after signing in):  %s\n\n' "$password"
exit 0

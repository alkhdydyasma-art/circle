-- Launch hardening:
--   1. Circle is the clinic platform now: drop the legacy "external platform" fields
--      (smart_clinic / medent + platform_url) and simplify activate_lead.
--   2. Rate limiting for public endpoints (forms, booking, API, sign-in).

-- ─── 1. Legacy platform fields ──────────────────────────────────────────────
create or replace function public.guard_clinic_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() and (
       new.status is distinct from old.status
    or new.plan is distinct from old.plan
    or new.lead_id is distinct from old.lead_id
  ) then
    raise exception 'only Circle staff can change subscription fields' using errcode = '42501';
  end if;
  return new;
end $$;

drop function if exists public.activate_lead(uuid, text, text, text);

alter table public.clinics drop column if exists platform;
alter table public.clinics drop column if exists platform_url;

-- Staff: turn a lead into a pending clinic and an owner invitation.
create or replace function public.activate_lead(p_lead uuid, p_owner_email text, p_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  l public.leads;
  new_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into l from public.leads where id = p_lead for update;
  if not found then raise exception 'lead not found' using errcode = 'P0002'; end if;

  insert into public.clinics (name, city, clinic_type, lead_id)
  values (l.clinic, l.city, l.clinic_type, l.id)
  returning id into new_id;

  insert into public.clinic_invitations (clinic_id, email, role, token_hash, invited_by)
  values (new_id, lower(trim(p_owner_email)), 'owner', p_token_hash, auth.uid());

  update public.leads set status = 'won' where id = l.id;
  return new_id;
end $$;

revoke execute on function public.activate_lead(uuid, text, text) from public, anon;
grant execute on function public.activate_lead(uuid, text, text) to authenticated;

-- ─── 2. Rate limiting ───────────────────────────────────────────────────────
-- Fixed-window counters keyed by e.g. "book:<hashed ip>". Only the server (service role)
-- may call rate_limit_hit; clients can't read or write the table.
create table if not exists public.rate_limits (
  key text not null check (char_length(key) <= 200),
  bucket bigint not null,
  hits int not null default 0,
  created_at timestamptz not null default now(),
  primary key (key, bucket)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Returns true while the caller is within p_limit hits per p_window_seconds.
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_bucket bigint := floor(extract(epoch from now()) / p_window_seconds);
  v_hits int;
begin
  insert into public.rate_limits (key, bucket, hits) values (p_key, v_bucket, 1)
  on conflict (key, bucket) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  -- Opportunistic cleanup keeps the table small without a cron job.
  if random() < 0.01 then
    delete from public.rate_limits where created_at < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end $$;

revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;

-- The Circle server calls it with the service-role key.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rate_limit_hit(text, int, int) to service_role;
  end if;
end $$;

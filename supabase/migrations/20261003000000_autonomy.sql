-- Autonomous operation.
-- 1) Bookings confirm themselves: the slot is validated by the database (open hours,
--    no overlap), so a receptionist confirming it adds nothing. On by default, per clinic.
-- 2) Operations log: every WhatsApp/agent/booking/n8n outcome is recorded (no patient data)
--    and grouped into incidents by error signature. The server heals what it can at runtime
--    (retries, fallback replies, circuit breaker); recurring incidents are sent to the
--    auto-fix pipeline (.github/workflows/autofix.yml), which opens a tested pull request for
--    the founder to approve; a periodic summary reports it all.

-- ─── 1. Auto-confirm ────────────────────────────────────────────────────────
alter table public.clinic_sites add column if not exists auto_confirm boolean not null default true;

create or replace function public.auto_confirm_appointment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending'
     and (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at or old.status <> 'pending')
     and (select auto_confirm from public.clinic_sites where clinic_id = new.clinic_id) then
    new.status := 'confirmed';
  end if;
  return new;
end $$;
drop trigger if exists appointments_auto_confirm on public.appointments;
create trigger appointments_auto_confirm before insert or update on public.appointments
  for each row execute function public.auto_confirm_appointment();

-- Upcoming requests waiting for a receptionist are confirmed now (clinics with auto-confirm on).
update public.appointments a set status = 'confirmed'
from public.clinic_sites s
where s.clinic_id = a.clinic_id and s.auto_confirm and a.status = 'pending' and a.starts_at > now();

-- Booking result now carries the final status, so the website can say "confirmed".
create or replace function public.book_core(
  p_clinic uuid, p_service uuid, p_doctor uuid, p_branch uuid, p_starts_at timestamptz,
  p_full_name text, p_phone text, p_notes text, p_source text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := public.normalize_sa_mobile(p_phone);
  v_name text := btrim(p_full_name);
  v_tz text;
  v_len interval;
  v_patient uuid;
  v_appt uuid;
begin
  if v_phone is null then raise exception 'invalid_phone' using errcode = '22023'; end if;
  if char_length(coalesce(v_name, '')) not between 2 and 120 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if char_length(coalesce(p_notes, '')) > 500 then raise exception 'invalid_notes' using errcode = '22023'; end if;

  select timezone into v_tz from public.clinic_sites where clinic_id = p_clinic;
  if not exists (
    select 1 from public.clinic_slots(p_clinic, p_service, (p_starts_at at time zone v_tz)::date, p_doctor, p_branch) s
    where s.starts_at = p_starts_at and s.doctor_id = p_doctor and s.branch_id = p_branch
  ) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;

  select make_interval(mins => duration_minutes) into v_len from public.services where id = p_service;

  insert into public.patients (clinic_id, full_name, phone, source)
  values (p_clinic, v_name, v_phone, p_source)
  on conflict (clinic_id, phone) do nothing;
  select id into v_patient from public.patients where clinic_id = p_clinic and phone = v_phone;

  if (select count(*) from public.appointments
      where patient_id = v_patient and source = p_source
        and status in ('pending', 'confirmed') and starts_at > now()) >= 3 then
    raise exception 'too_many_bookings' using errcode = 'P0001';
  end if;

  begin
    insert into public.appointments
      (clinic_id, branch_id, doctor_id, service_id, patient_id, starts_at, ends_at, source, notes)
    values
      (p_clinic, p_branch, p_doctor, p_service, v_patient, p_starts_at, p_starts_at + v_len, p_source, nullif(btrim(p_notes), ''))
    returning id into v_appt;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end;

  return jsonb_build_object(
    'id', v_appt,
    'starts_at', p_starts_at,
    'service', (select name from public.services where id = p_service),
    'doctor', (select full_name from public.doctors where id = p_doctor),
    'branch', (select name from public.branches where id = p_branch),
    'status', (select status from public.appointments where id = v_appt),
    'manage_token', public.new_manage_token(v_appt)
  );
end $$;


-- ─── 2. Medical emergency protocol ─────────────────────────────────────────
-- A message describing a possible emergency stops the assistant for that chat, sends the
-- patient to 997 / the clinic phone (done by the server) and raises a red alert on the
-- clinic dashboard until a staff member acknowledges it.
alter table public.conversations
  add column if not exists emergency_at timestamptz,
  add column if not exists emergency_ack_at timestamptz;
grant update (status, needs_attention, emergency_ack_at) on public.conversations to authenticated;
create index if not exists conversations_emergency_idx on public.conversations (clinic_id)
  where emergency_at is not null and emergency_ack_at is null;

create or replace function public.agent_emergency(p_conversation uuid, p_reason text)
returns void language sql security definer set search_path = '' as $$
  update public.conversations
  set status = 'human', needs_attention = true, handoff_reason = left('EMERGENCY: ' || p_reason, 300),
      emergency_at = now(), emergency_ack_at = null
  where id = p_conversation;
$$;
revoke execute on function public.agent_emergency(uuid, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.agent_emergency(uuid, text) to service_role;
  end if;
end $$;

-- ─── 3. Operations log ──────────────────────────────────────────────────────
create table if not exists public.ops_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null check (source in ('agent', 'booking', 'whatsapp', 'n8n', 'reminders', 'api', 'deploy')),
  -- ok: handled (latency sample) · error · retry_ok: failed then healed by a retry ·
  -- fallback: patient got the safe fallback reply · degraded: circuit breaker opened
  kind text not null check (kind in ('ok', 'error', 'retry_ok', 'fallback', 'degraded')),
  signature text,
  message text check (char_length(message) <= 500),
  clinic_id uuid references public.clinics (id) on delete set null,
  latency_ms int check (latency_ms >= 0)
);
create index if not exists ops_events_recent_idx on public.ops_events (created_at desc, source, kind);

create table if not exists public.ops_incidents (
  signature text primary key,
  source text not null,
  message text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  occurrences int not null default 1,
  -- open → fixing (issue sent to the auto-fix pipeline) → awaiting_approval (tested PR) → fixed | no_fix
  status text not null default 'open' check (status in ('open', 'fixing', 'fixed', 'awaiting_approval', 'no_fix', 'ignored')),
  issue_number int,
  pr_url text check (pr_url is null or pr_url ~ '^https://github\.com/'),
  sent_at timestamptz,
  fixed_at timestamptz
);
alter table public.ops_incidents add column if not exists sent_at timestamptz;

do $$
declare t text;
begin
  foreach t in array array['ops_events', 'ops_incidents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "%1$s: Circle staff read" on public.%1$I', t);
    execute format('create policy "%1$s: Circle staff read" on public.%1$I for select to authenticated using (public.is_platform_admin())', t);
  end loop;
end $$;

-- Strips anything that could identify a person before an error is stored or shared:
-- phone-like digit runs, e-mails, ids, quoted values (Postgres DETAIL lines quote data).
create or replace function public.ops_scrub(p text)
returns text language sql immutable set search_path = '' as $$
  select left(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    coalesce(p, ''),
    '\(([^()]*)\)=\(([^()]*)\)', '(\1)=(…)', 'g'),
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+', '<email>', 'g'),
    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '<id>', 'g'),
    '\+?[0-9][0-9 ]{5,}[0-9]', '<num>', 'g'),
    '"[^"]{24,}"', '"…"', 'g'), 500);
$$;

create or replace function public.ops_record(
  p_source text, p_kind text, p_message text default null, p_clinic uuid default null, p_latency_ms int default null
) returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v_msg text := nullif(public.ops_scrub(p_message), '');
  v_sig text;
begin
  if p_kind in ('error', 'fallback') and v_msg is not null then
    v_sig := left(md5(p_source || ':' || regexp_replace(lower(v_msg), '[0-9]+', '#', 'g')), 16);
    insert into public.ops_incidents as i (signature, source, message)
    values (v_sig, p_source, v_msg)
    on conflict (signature) do update set
      last_seen = now(), occurrences = i.occurrences + 1,
      -- a fixed error that comes back is reopened
      status = case when i.status in ('fixed', 'no_fix') and i.fixed_at < now() - interval '1 hour' then 'open' else i.status end;
  end if;
  insert into public.ops_events (source, kind, signature, message, clinic_id, latency_ms)
  values (p_source, p_kind, v_sig, v_msg, p_clinic, p_latency_ms);
  if random() < 0.01 then
    delete from public.ops_events where created_at < now() - interval '60 days';
  end if;
  return v_sig;
end $$;

-- Circuit breaker for the AI agent: open when the last 10 minutes have 5+ errors and more
-- errors than successful replies. While open, patients get the safe fallback (booking link)
-- and a fraction of messages still probe the agent, so it closes by itself on recovery.
create or replace function public.ops_agent_degraded()
returns boolean language sql stable security definer set search_path = '' as $$
  select count(*) filter (where kind = 'error') >= 5
     and count(*) filter (where kind = 'error') > count(*) filter (where kind in ('ok', 'retry_ok'))
  from public.ops_events where source = 'agent' and created_at > now() - interval '10 minutes';
$$;

-- Incidents ready for the auto-fix pipeline: recurring (3+), or any booking failure (critical
-- path), not yet sent. Cost caps: at most p_max per call, 5 in progress and 3 sent per day.
create or replace function public.ops_incidents_to_fix(p_max int default 3)
returns setof public.ops_incidents language sql stable security definer set search_path = '' as $$
  select * from public.ops_incidents
  where status = 'open' and (occurrences >= 3 or source = 'booking')
    and last_seen > now() - interval '7 days'
  order by occurrences desc, last_seen desc
  limit greatest(0, least(p_max, 10,
    5 - (select count(*)::int from public.ops_incidents where status = 'fixing'),
    3 - (select count(*)::int from public.ops_incidents where sent_at > now() - interval '1 day')));
$$;

create or replace function public.ops_incident_update(
  p_signature text, p_status text, p_issue int default null, p_pr_url text default null
) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.ops_incidents set status = p_status,
    issue_number = coalesce(p_issue, issue_number), pr_url = coalesce(p_pr_url, pr_url),
    fixed_at = case when p_status = 'fixed' then now() else fixed_at end,
    sent_at = case when p_status = 'fixing' and issue_number is null then now() else sent_at end
  where signature = p_signature;
end $$;

-- Operations summary for a period: reliability, speed, self-healing and fixes.
create or replace function public.ops_summary(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  with e as (select * from public.ops_events where created_at >= p_from and created_at < p_to)
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'by_source', coalesce((select jsonb_object_agg(source, x) from (
      select source, jsonb_build_object(
        'ok', count(*) filter (where kind = 'ok'),
        'errors', count(*) filter (where kind = 'error'),
        'healed_by_retry', count(*) filter (where kind = 'retry_ok'),
        'fallbacks', count(*) filter (where kind = 'fallback'),
        'error_rate', round(count(*) filter (where kind = 'error')::numeric / nullif(count(*) filter (where kind in ('ok', 'error', 'retry_ok')), 0), 4)
      ) as x from e group by source) s), '{}'),
    'agent_latency_ms', (select jsonb_build_object(
        'p50', round(percentile_cont(0.5) within group (order by latency_ms)),
        'p95', round(percentile_cont(0.95) within group (order by latency_ms)))
      from e where source = 'agent' and kind in ('ok', 'retry_ok') and latency_ms is not null),
    'degraded_periods', (select count(*) from e where kind = 'degraded'),
    'auto_confirmed', (select count(*) from public.appointments where created_at >= p_from and created_at < p_to and status <> 'pending'
                        and source in ('website', 'ai_agent', 'whatsapp')),
    'incidents', jsonb_build_object(
      'new', (select count(*) from public.ops_incidents where first_seen >= p_from and first_seen < p_to),
      'fixed', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'message', message, 'pr', pr_url, 'occurrences', occurrences))
                from public.ops_incidents where status = 'fixed' and fixed_at >= p_from and fixed_at < p_to), '[]'),
      'awaiting_approval', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'message', message, 'pr', pr_url))
                from public.ops_incidents where status = 'awaiting_approval'), '[]'),
      'open', (select count(*) from public.ops_incidents where status in ('open', 'fixing')))
  );
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.ops_scrub(text)', 'public.ops_record(text, text, text, uuid, int)', 'public.ops_agent_degraded()',
    'public.ops_incidents_to_fix(int)', 'public.ops_incident_update(text, text, int, text)',
    'public.ops_summary(timestamptz, timestamptz)', 'public.auto_confirm_appointment()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;

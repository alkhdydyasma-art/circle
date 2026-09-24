-- Automation: per-clinic API keys (n8n / AI agent), WhatsApp reminders, patient
-- self-service links (confirm / cancel / reschedule) and automatic occasion themes.
--
-- Everything callable from outside runs as a SECURITY DEFINER function scoped to one clinic:
--   * api_*     — authenticated by the SHA-256 of a clinic API key (never the raw key).
--   * manage_*  — authenticated by the SHA-256 of a per-appointment link token.
-- The functions resolve the clinic themselves, so a caller can never reach another clinic.

-- ─── Settings & columns ─────────────────────────────────────────────────────
alter table public.clinic_sites
  add column if not exists reminders_enabled boolean not null default false,
  add column if not exists reminder_hours_before int not null default 24 check (reminder_hours_before between 1 and 72),
  add column if not exists reschedule_cutoff_hours int not null default 24 check (reschedule_cutoff_hours between 0 and 168),
  add column if not exists auto_occasions boolean not null default false;

alter table public.appointments
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists manage_token_hash text unique;

create table if not exists public.clinic_api_keys (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  prefix text not null check (char_length(prefix) between 4 and 16), -- shown in the UI to tell keys apart
  key_hash text not null unique,                                       -- SHA-256 hex of the full key
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table public.clinic_api_keys enable row level security;
revoke all on public.clinic_api_keys from anon, authenticated;
grant select, insert on public.clinic_api_keys to authenticated;
grant update (revoked_at) on public.clinic_api_keys to authenticated;

drop policy if exists "api keys: managers" on public.clinic_api_keys;
create policy "api keys: managers" on public.clinic_api_keys for all to authenticated
  using (public.can_manage_clinic(clinic_id))
  with check (public.can_manage_clinic(clinic_id) and created_by = auth.uid());

drop trigger if exists clinic_api_keys_guard_clinic on public.clinic_api_keys;
create trigger clinic_api_keys_guard_clinic before update on public.clinic_api_keys
  for each row execute function public.guard_clinic_id();
drop trigger if exists clinic_api_keys_audit on public.clinic_api_keys;
create trigger clinic_api_keys_audit after insert or update on public.clinic_api_keys
  for each row execute function public.audit_row();

-- audit_row strips token_hash; also keep key hashes out of the audit trail.
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old)) - 'token_hash' - 'key_hash' - 'manage_token_hash';
begin
  insert into public.audit_log (clinic_id, actor, action, details)
  values (
    coalesce((rec ->> 'clinic_id')::uuid, (rec ->> 'id')::uuid),
    auth.uid(),
    tg_table_name || '.' || lower(tg_op),
    case when tg_op = 'UPDATE'
      then jsonb_build_object('old', to_jsonb(old) - 'token_hash' - 'key_hash' - 'manage_token_hash', 'new', rec)
      else rec end
  );
  return coalesce(new, old);
end $$;

-- The doctor guard must only restrict signed-in doctors. The API and self-service links
-- reschedule through SECURITY DEFINER functions with no dashboard user attached.
create or replace function public.guard_appointment_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.clinic_role_of(old.clinic_id) = 'doctor' and not public.is_front_desk(old.clinic_id) and (
       new.branch_id is distinct from old.branch_id or new.doctor_id is distinct from old.doctor_id
    or new.service_id is distinct from old.service_id or new.patient_id is distinct from old.patient_id
    or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
    or new.source is distinct from old.source
  ) then
    raise exception 'doctors can only change status and notes' using errcode = '42501';
  end if;
  return new;
end $$;

-- ─── Internal building blocks (not callable by clients) ─────────────────────
create or replace function public.sha256_hex(p text)
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex');
$$;

-- Open slots for one clinic. p_ignore lets a patient reschedule onto a time that
-- overlaps their own current appointment.
create or replace function public.clinic_slots(
  p_clinic uuid, p_service uuid, p_day date, p_doctor uuid default null, p_branch uuid default null, p_ignore uuid default null
) returns table (doctor_id uuid, branch_id uuid, starts_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with site as (
    select s.clinic_id, s.timezone, s.slot_minutes, s.min_notice_minutes, s.booking_days_ahead,
           (now() at time zone s.timezone)::date as today
    from public.clinic_sites s where s.clinic_id = p_clinic
  ),
  svc as (
    select sv.id, make_interval(mins => sv.duration_minutes) as len
    from public.services sv join site on site.clinic_id = sv.clinic_id
    where sv.id = p_service and sv.is_active
  ),
  candidates as (
    select wh.doctor_id, wh.branch_id, g.starts_at
    from site, svc, public.working_hours wh
    join public.doctors d on d.id = wh.doctor_id and d.is_active
    join public.branches b on b.id = wh.branch_id and b.is_active
    join public.doctor_services ds on ds.doctor_id = wh.doctor_id
    cross join lateral generate_series(
      (p_day + wh.start_time) at time zone site.timezone,
      ((p_day + wh.end_time) at time zone site.timezone) - svc.len,
      make_interval(mins => site.slot_minutes)
    ) as g(starts_at)
    where wh.clinic_id = site.clinic_id
      and ds.service_id = svc.id
      and wh.weekday = extract(dow from p_day)
      and p_day between site.today and site.today + site.booking_days_ahead
      and (p_doctor is null or wh.doctor_id = p_doctor)
      and (p_branch is null or wh.branch_id = p_branch)
  )
  select distinct c.doctor_id, c.branch_id, c.starts_at
  from candidates c, site, svc
  where c.starts_at >= now() + make_interval(mins => site.min_notice_minutes)
    and not exists (
      select 1 from public.appointments a
      where a.doctor_id = c.doctor_id and a.status in ('pending', 'confirmed')
        and a.id is distinct from p_ignore
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(c.starts_at, c.starts_at + svc.len))
    and not exists (
      select 1 from public.time_off t
      where t.clinic_id = site.clinic_id and (t.doctor_id is null or t.doctor_id = c.doctor_id)
        and tstzrange(t.starts_at, t.ends_at) && tstzrange(c.starts_at, c.starts_at + svc.len))
  order by c.starts_at, c.doctor_id;
$$;

-- Public wrapper keeps its signature; it now delegates to clinic_slots.
create or replace function public.available_slots(
  p_slug text, p_service uuid, p_day date, p_doctor uuid default null, p_branch uuid default null
) returns table (doctor_id uuid, branch_id uuid, starts_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.* from public.clinic_sites cs
  join public.clinics c on c.id = cs.clinic_id
  cross join lateral public.clinic_slots(cs.clinic_id, p_service, p_day, p_doctor, p_branch) s
  where cs.slug = p_slug and cs.published and c.status = 'active';
$$;

-- Issues a fresh self-service link token for an appointment; only its hash is stored.
create or replace function public.new_manage_token(p_appt uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  update public.appointments set manage_token_hash = public.sha256_hex(v_token) where id = p_appt;
  return v_token;
end $$;

-- Shared booking core: validates the slot, reuses the patient by phone, caps open bookings
-- per phone per channel, and returns details plus a self-service link token.
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
    'manage_token', public.new_manage_token(v_appt)
  );
end $$;

-- Moves an appointment to a new open slot (same service), within the clinic's cutoff.
create or replace function public.reschedule_core(
  p_appt uuid, p_starts_at timestamptz, p_doctor uuid, p_branch uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.appointments;
  v_site public.clinic_sites;
  v_doctor uuid;
  v_branch uuid;
begin
  select * into a from public.appointments where id = p_appt for update;
  select * into v_site from public.clinic_sites where clinic_id = a.clinic_id;
  if a.status not in ('pending', 'confirmed') or a.starts_at - now() < make_interval(hours => v_site.reschedule_cutoff_hours) then
    raise exception 'too_late_to_change' using errcode = 'P0001';
  end if;
  v_doctor := coalesce(p_doctor, a.doctor_id);
  v_branch := coalesce(p_branch, a.branch_id);
  if not exists (
    select 1 from public.clinic_slots(a.clinic_id, a.service_id, (p_starts_at at time zone v_site.timezone)::date, v_doctor, v_branch, a.id) s
    where s.starts_at = p_starts_at and s.doctor_id = v_doctor and s.branch_id = v_branch
  ) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;
  begin
    update public.appointments set
      starts_at = p_starts_at, ends_at = p_starts_at + (a.ends_at - a.starts_at),
      doctor_id = v_doctor, branch_id = v_branch, status = 'pending', reminder_sent_at = null
    where id = a.id;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end;
  return jsonb_build_object('id', a.id, 'starts_at', p_starts_at, 'status', 'pending');
end $$;

-- Customer-facing appointment summary (no internal ids beyond what's needed).
create or replace function public.appointment_view(p_appt uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status,
    'service_id', a.service_id, 'service', sv.name,
    'doctor_id', a.doctor_id, 'doctor', d.full_name,
    'branch_id', a.branch_id, 'branch', b.name, 'branch_address', b.address, 'maps_url', b.maps_url,
    'clinic', c.name, 'slug', s.slug, 'timezone', s.timezone, 'whatsapp', s.whatsapp,
    'template', s.template, 'brand', s.brand,
    'patient_name', p.full_name, 'patient_phone', p.phone,
    'can_change', a.status in ('pending', 'confirmed') and a.starts_at - now() >= make_interval(hours => s.reschedule_cutoff_hours),
    'cutoff_hours', s.reschedule_cutoff_hours
  )
  from public.appointments a
  join public.services sv on sv.id = a.service_id
  join public.doctors d on d.id = a.doctor_id
  join public.branches b on b.id = a.branch_id
  join public.patients p on p.id = a.patient_id
  join public.clinics c on c.id = a.clinic_id
  join public.clinic_sites s on s.clinic_id = a.clinic_id
  where a.id = p_appt;
$$;

-- Website bookings now also return a self-service link token.
create or replace function public.book_appointment(
  p_slug text, p_service uuid, p_doctor uuid, p_branch uuid, p_starts_at timestamptz,
  p_full_name text, p_phone text, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_clinic uuid;
begin
  select s.clinic_id into v_clinic
  from public.clinic_sites s join public.clinics c on c.id = s.clinic_id
  where s.slug = p_slug and s.published and c.status = 'active';
  if v_clinic is null then raise exception 'clinic_not_found' using errcode = 'P0002'; end if;
  return public.book_core(v_clinic, p_service, p_doctor, p_branch, p_starts_at, p_full_name, p_phone, p_notes, 'website');
end $$;

-- Effective template: occasion themes switch on automatically in their date windows.
create or replace function public.effective_template(p_site public.clinic_sites)
returns text language sql stable set search_path = '' as $$
  select case
    when not p_site.auto_occasions then p_site.template
    when to_char(now() at time zone p_site.timezone, 'MM-DD') between '02-20' and '02-25' then 'founding_day'
    when to_char(now() at time zone p_site.timezone, 'MM-DD') between '09-20' and '09-26' then 'national_day'
    else p_site.template
  end;
$$;

create or replace function public.public_site(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'clinic', jsonb_build_object('id', c.id, 'name', c.name, 'city', c.city),
    'site', jsonb_build_object(
      'slug', s.slug, 'template', public.effective_template(s), 'brand', s.brand, 'content', s.content,
      'phone', s.phone, 'whatsapp', s.whatsapp, 'email', s.email, 'timezone', s.timezone,
      'booking_days_ahead', s.booking_days_ahead, 'reminders_enabled', s.reminders_enabled),
    'branches', coalesce((select jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'city', b.city, 'address', b.address, 'phone', b.phone, 'maps_url', b.maps_url)
        order by b.created_at)
      from public.branches b where b.clinic_id = c.id and b.is_active), '[]'),
    'doctors', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'full_name', d.full_name, 'title', d.title, 'specialty', d.specialty,
        'bio', d.bio, 'photo_url', d.photo_url,
        'service_ids', coalesce((select jsonb_agg(ds.service_id) from public.doctor_services ds where ds.doctor_id = d.id), '[]'))
        order by d.sort, d.full_name)
      from public.doctors d where d.clinic_id = c.id and d.is_active), '[]'),
    'services', coalesce((select jsonb_agg(jsonb_build_object(
        'id', sv.id, 'name', sv.name, 'description', sv.description,
        'duration_minutes', sv.duration_minutes, 'price', sv.price)
        order by sv.sort, sv.name)
      from public.services sv where sv.clinic_id = c.id and sv.is_active), '[]')
  )
  from public.clinic_sites s
  join public.clinics c on c.id = s.clinic_id
  where s.slug = p_slug and s.published and c.status = 'active';
$$;

-- ─── Clinic API (n8n, AI agent) ─────────────────────────────────────────────
create or replace function public.api_clinic(p_key_hash text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_clinic uuid;
begin
  update public.clinic_api_keys k set last_used_at = now()
  from public.clinics c
  where k.key_hash = p_key_hash and k.revoked_at is null and c.id = k.clinic_id and c.status = 'active'
  returning k.clinic_id into v_clinic;
  if v_clinic is null then raise exception 'invalid_api_key' using errcode = '28000'; end if;
  return v_clinic;
end $$;

-- Everything the AI agent needs as context (RAG): services, prices, doctors, branches, hours, rules.
create or replace function public.api_clinic_info(p_key_hash text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_clinic uuid := public.api_clinic(p_key_hash);
begin
  return (
    select jsonb_build_object(
      'clinic', jsonb_build_object('name', c.name, 'city', c.city, 'phone', s.phone, 'whatsapp', s.whatsapp,
                                   'email', s.email, 'timezone', s.timezone, 'about', s.content ->> 'about'),
      'booking_rules', jsonb_build_object('slot_minutes', s.slot_minutes, 'booking_days_ahead', s.booking_days_ahead,
                                          'min_notice_minutes', s.min_notice_minutes, 'reschedule_cutoff_hours', s.reschedule_cutoff_hours),
      'services', coalesce((select jsonb_agg(jsonb_build_object('id', sv.id, 'name', sv.name, 'description', sv.description,
          'duration_minutes', sv.duration_minutes, 'price', sv.price) order by sv.sort)
        from public.services sv where sv.clinic_id = c.id and sv.is_active), '[]'),
      'doctors', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.full_name, 'title', d.title,
          'specialty', d.specialty, 'service_ids', coalesce((select jsonb_agg(ds.service_id) from public.doctor_services ds where ds.doctor_id = d.id), '[]'),
          'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', w.weekday, 'branch_id', w.branch_id,
              'start', to_char(w.start_time, 'HH24:MI'), 'end', to_char(w.end_time, 'HH24:MI')) order by w.weekday, w.start_time)
            from public.working_hours w where w.doctor_id = d.id), '[]')) order by d.sort)
        from public.doctors d where d.clinic_id = c.id and d.is_active), '[]'),
      'branches', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'address', b.address,
          'phone', b.phone, 'maps_url', b.maps_url))
        from public.branches b where b.clinic_id = c.id and b.is_active), '[]')
    )
    from public.clinics c join public.clinic_sites s on s.clinic_id = c.id
    where c.id = v_clinic
  );
end $$;

create or replace function public.api_slots(
  p_key_hash text, p_service uuid, p_day date, p_doctor uuid default null, p_branch uuid default null
) returns table (doctor_id uuid, branch_id uuid, starts_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare v_clinic uuid := public.api_clinic(p_key_hash);
begin
  return query select * from public.clinic_slots(v_clinic, p_service, p_day, p_doctor, p_branch);
end $$;

create or replace function public.api_book(
  p_key_hash text, p_service uuid, p_doctor uuid, p_branch uuid, p_starts_at timestamptz,
  p_full_name text, p_phone text, p_source text default 'ai_agent', p_notes text default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_source not in ('whatsapp', 'ai_agent') then raise exception 'invalid_source' using errcode = '22023'; end if;
  return public.book_core(public.api_clinic(p_key_hash), p_service, p_doctor, p_branch, p_starts_at,
                          p_full_name, p_phone, p_notes, p_source);
end $$;

-- Upcoming appointments of a patient (by phone) in this clinic.
create or replace function public.api_find_appointments(p_key_hash text, p_phone text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_clinic uuid := public.api_clinic(p_key_hash);
begin
  return coalesce((
    select jsonb_agg(public.appointment_view(a.id) order by a.starts_at)
    from public.appointments a join public.patients p on p.id = a.patient_id
    where a.clinic_id = v_clinic and p.phone = public.normalize_sa_mobile(p_phone)
      and a.status in ('pending', 'confirmed') and a.starts_at > now()
  ), '[]');
end $$;

-- The phone must match the appointment: the agent can only act for the person it's talking to.
create or replace function public.api_owned_appointment(p_key_hash text, p_appt uuid, p_phone text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_clinic uuid := public.api_clinic(p_key_hash);
begin
  if not exists (
    select 1 from public.appointments a join public.patients p on p.id = a.patient_id
    where a.id = p_appt and a.clinic_id = v_clinic and p.phone = public.normalize_sa_mobile(p_phone)
  ) then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;
  return p_appt;
end $$;

create or replace function public.api_cancel(p_key_hash text, p_appt uuid, p_phone text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid := public.api_owned_appointment(p_key_hash, p_appt, p_phone);
begin
  update public.appointments set status = 'cancelled'
  where id = v_id and status in ('pending', 'confirmed');
  if not found then raise exception 'too_late_to_change' using errcode = 'P0001'; end if;
  return public.appointment_view(v_id);
end $$;

create or replace function public.api_reschedule(
  p_key_hash text, p_appt uuid, p_phone text, p_starts_at timestamptz, p_doctor uuid default null, p_branch uuid default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid := public.api_owned_appointment(p_key_hash, p_appt, p_phone);
begin
  perform public.reschedule_core(v_id, p_starts_at, p_doctor, p_branch);
  return public.appointment_view(v_id);
end $$;

-- Appointments due for a WhatsApp reminder, each with a fresh self-service link token.
create or replace function public.api_due_reminders(p_key_hash text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_clinic uuid := public.api_clinic(p_key_hash);
  v_out jsonb := '[]';
  r record;
begin
  for r in
    select a.id from public.appointments a join public.clinic_sites s on s.clinic_id = a.clinic_id
    where a.clinic_id = v_clinic and s.reminders_enabled
      and a.status in ('pending', 'confirmed') and a.reminder_sent_at is null
      and a.starts_at > now() and a.starts_at <= now() + make_interval(hours => s.reminder_hours_before)
    order by a.starts_at
    limit 200
  loop
    v_out := v_out || jsonb_build_array(public.appointment_view(r.id) || jsonb_build_object('manage_token', public.new_manage_token(r.id)));
  end loop;
  return v_out;
end $$;

create or replace function public.api_mark_reminded(p_key_hash text, p_appt uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_clinic uuid := public.api_clinic(p_key_hash);
begin
  update public.appointments set reminder_sent_at = now() where id = p_appt and clinic_id = v_clinic;
  if not found then raise exception 'appointment_not_found' using errcode = 'P0002'; end if;
end $$;

-- ─── Patient self-service (link from confirmation / reminder) ───────────────
create or replace function public.manage_appointment(p_token_hash text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.appointment_view(id) from public.appointments where manage_token_hash = p_token_hash;
$$;

create or replace function public.manage_appt_id(p_token_hash text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
  select id into v from public.appointments where manage_token_hash = p_token_hash;
  if v is null then raise exception 'appointment_not_found' using errcode = 'P0002'; end if;
  return v;
end $$;

create or replace function public.manage_confirm(p_token_hash text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v uuid := public.manage_appt_id(p_token_hash);
begin
  update public.appointments set status = 'confirmed' where id = v and status = 'pending' and starts_at > now();
  return public.appointment_view(v);
end $$;

create or replace function public.manage_cancel(p_token_hash text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v uuid := public.manage_appt_id(p_token_hash);
begin
  if not (public.appointment_view(v) ->> 'can_change')::boolean then
    raise exception 'too_late_to_change' using errcode = 'P0001';
  end if;
  update public.appointments set status = 'cancelled' where id = v;
  return public.appointment_view(v);
end $$;

create or replace function public.manage_slots(p_token_hash text, p_day date)
returns table (doctor_id uuid, branch_id uuid, starts_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id = public.manage_appt_id(p_token_hash);
  return query select * from public.clinic_slots(a.clinic_id, a.service_id, p_day, a.doctor_id, null, a.id);
end $$;

create or replace function public.manage_reschedule(p_token_hash text, p_starts_at timestamptz, p_branch uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v uuid := public.manage_appt_id(p_token_hash);
begin
  perform public.reschedule_core(v, p_starts_at, null, p_branch);
  return public.appointment_view(v);
end $$;

-- ─── Grants ─────────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  -- Internal helpers: nobody calls these directly.
  foreach f in array array[
    'public.clinic_slots(uuid, uuid, date, uuid, uuid, uuid)', 'public.new_manage_token(uuid)',
    'public.book_core(uuid, uuid, uuid, uuid, timestamptz, text, text, text, text)',
    'public.reschedule_core(uuid, timestamptz, uuid, uuid)', 'public.appointment_view(uuid)',
    'public.api_clinic(text)', 'public.api_owned_appointment(text, uuid, text)', 'public.manage_appt_id(text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  -- Entry points for the API routes and the patient self-service page.
  foreach f in array array[
    'public.api_clinic_info(text)', 'public.api_slots(text, uuid, date, uuid, uuid)',
    'public.api_book(text, uuid, uuid, uuid, timestamptz, text, text, text, text)',
    'public.api_find_appointments(text, text)', 'public.api_cancel(text, uuid, text)',
    'public.api_reschedule(text, uuid, text, timestamptz, uuid, uuid)',
    'public.api_due_reminders(text)', 'public.api_mark_reminded(text, uuid)',
    'public.manage_appointment(text)', 'public.manage_confirm(text)', 'public.manage_cancel(text)',
    'public.manage_slots(text, date)', 'public.manage_reschedule(text, timestamptz, uuid)'] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

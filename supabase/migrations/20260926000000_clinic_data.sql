-- Clinic data: public site config, branches, doctors, services, schedules,
-- patients and appointments — plus the public booking functions.
--
-- Isolation model (same as the portal migration)
--   * Every row carries clinic_id; RLS limits each user to their own clinics.
--   * Cross-table references use composite keys (clinic_id, id), so a row can
--     never point at another clinic's doctor, service, patient…
--   * The public (anon) role has no table access at all. Visitors only use the
--     SECURITY DEFINER functions public_site / available_slots / book_appointment.
--   * Clinical notes live in a separate table that reception cannot read.

create extension if not exists btree_gist with schema extensions;

-- ─── Helpers ────────────────────────────────────────────────────────────────
create or replace function public.has_clinic_role(p_clinic uuid, p_roles public.clinic_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or public.clinic_role_of(p_clinic) = any (p_roles);
$$;

-- Front-desk access to patients and appointments.
create or replace function public.is_front_desk(p_clinic uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_clinic_role(p_clinic, '{owner,manager,reception}');
$$;

-- Keeps tenant rows in their clinic forever.
create or replace function public.guard_clinic_id()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.clinic_id is distinct from old.clinic_id then
    raise exception 'clinic_id cannot change' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- +9665XXXXXXXX from 05XXXXXXXX / 5XXXXXXXX / 9665… / 009665…; null if not a Saudi mobile.
create or replace function public.normalize_sa_mobile(p text)
returns text language sql immutable set search_path = '' as $$
  select case
    when regexp_replace(coalesce(p, ''), '[\s-]', '', 'g') ~ '^(\+?966|00966|0)?5[0-9]{8}$'
    then '+966' || right(regexp_replace(p, '[\s-]', '', 'g'), 9)
  end;
$$;

-- ─── Public site ────────────────────────────────────────────────────────────
create table if not exists public.clinic_sites (
  clinic_id uuid primary key references public.clinics (id) on delete cascade,
  slug text not null unique
    check (slug ~ '^[a-z0-9](-?[a-z0-9])*$' and char_length(slug) between 3 and 40),
  published boolean not null default false,
  template text not null default 'modern' check (template in ('modern', 'calm', 'premium')),
  -- { primary, accent, font, logo_url, hero_image_url }
  brand jsonb not null default '{}' check (jsonb_typeof(brand) = 'object'),
  -- { tagline, about, sections: { doctors: true, … } }
  content jsonb not null default '{}' check (jsonb_typeof(content) = 'object'),
  phone text check (phone is null or char_length(phone) <= 30),
  whatsapp text check (whatsapp is null or whatsapp ~ '^\+9665[0-9]{8}$'),
  email text check (email is null or char_length(email) <= 160),
  timezone text not null default 'Asia/Riyadh',
  slot_minutes int not null default 15 check (slot_minutes in (10, 15, 20, 30, 60)),
  booking_days_ahead int not null default 30 check (booking_days_ahead between 1 and 180),
  min_notice_minutes int not null default 120 check (min_notice_minutes between 0 and 10080),
  updated_at timestamptz not null default now()
);

-- Every new clinic gets a draft site. The placeholder slug embeds the whole id so it
-- can never collide; staff replace it with a readable slug before publishing.
create or replace function public.create_clinic_site()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.clinic_sites (clinic_id, slug)
  values (new.id, 'c-' || replace(new.id::text, '-', ''))
  on conflict (clinic_id) do nothing;
  return new;
end $$;

drop trigger if exists clinics_create_site on public.clinics;
create trigger clinics_create_site after insert on public.clinics
  for each row execute function public.create_clinic_site();

insert into public.clinic_sites (clinic_id, slug)
select id, 'c-' || replace(id::text, '-', '') from public.clinics
on conflict (clinic_id) do nothing;

-- ─── Configuration ──────────────────────────────────────────────────────────
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  city text check (char_length(city) <= 80),
  address text check (char_length(address) <= 300),
  phone text check (char_length(phone) <= 30),
  maps_url text check (maps_url is null or maps_url ~ '^https://'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, id)
);

create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  -- Optional link to the doctor's portal account (must be a member of the same clinic).
  user_id uuid,
  full_name text not null check (char_length(full_name) between 2 and 120),
  title text check (char_length(title) <= 80),
  specialty text check (char_length(specialty) <= 120),
  bio text check (char_length(bio) <= 1000),
  photo_url text check (photo_url is null or photo_url ~ '^https://'),
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (clinic_id, id),
  unique (clinic_id, user_id),
  foreign key (clinic_id, user_id) references public.clinic_members (clinic_id, user_id)
    on delete set null (user_id)
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 600),
  duration_minutes int not null default 30 check (duration_minutes between 5 and 480),
  price numeric(10, 2) check (price is null or price >= 0),
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (clinic_id, id)
);

create table if not exists public.doctor_services (
  clinic_id uuid not null,
  doctor_id uuid not null,
  service_id uuid not null,
  primary key (doctor_id, service_id),
  foreign key (clinic_id, doctor_id) references public.doctors (clinic_id, id) on delete cascade,
  foreign key (clinic_id, service_id) references public.services (clinic_id, id) on delete cascade
);

-- Weekly availability, in the clinic's local time (clinic_sites.timezone).
create table if not exists public.working_hours (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  doctor_id uuid not null,
  branch_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  check (end_time > start_time),
  foreign key (clinic_id, doctor_id) references public.doctors (clinic_id, id) on delete cascade,
  foreign key (clinic_id, branch_id) references public.branches (clinic_id, id) on delete cascade
);
create index if not exists working_hours_lookup_idx on public.working_hours (clinic_id, weekday);

-- Holidays / leave. doctor_id null = whole clinic closed.
create table if not exists public.time_off (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  doctor_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (char_length(reason) <= 200),
  check (ends_at > starts_at),
  foreign key (clinic_id, doctor_id) references public.doctors (clinic_id, id) on delete cascade
);

-- ─── Patients & appointments ────────────────────────────────────────────────
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text not null check (phone ~ '^\+9665[0-9]{8}$'),
  email text check (email is null or char_length(email) <= 160),
  gender text check (gender in ('male', 'female')),
  birth_date date,
  notes text check (char_length(notes) <= 2000), -- administrative notes, visible to front desk
  source text not null default 'dashboard' check (source in ('website', 'whatsapp', 'dashboard', 'ai_agent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, id),
  unique (clinic_id, phone)
);

-- Clinical information: owners, managers and treating doctors only.
create table if not exists public.patient_clinical (
  patient_id uuid primary key,
  clinic_id uuid not null,
  medical_history text check (char_length(medical_history) <= 5000),
  allergies text check (char_length(allergies) <= 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  foreign key (clinic_id, patient_id) references public.patients (clinic_id, id) on delete cascade
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  branch_id uuid not null,
  doctor_id uuid not null,
  service_id uuid not null,
  patient_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  source text not null default 'dashboard' check (source in ('website', 'whatsapp', 'dashboard', 'ai_agent')),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (clinic_id, id),
  foreign key (clinic_id, branch_id) references public.branches (clinic_id, id),
  foreign key (clinic_id, doctor_id) references public.doctors (clinic_id, id),
  foreign key (clinic_id, service_id) references public.services (clinic_id, id),
  foreign key (clinic_id, patient_id) references public.patients (clinic_id, id) on delete cascade,
  -- A doctor can never be double-booked, even under concurrent bookings.
  constraint appointments_no_overlap exclude using gist (
    doctor_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status in ('pending', 'confirmed'))
);
create index if not exists appointments_clinic_time_idx on public.appointments (clinic_id, starts_at);
create index if not exists appointments_patient_idx on public.appointments (patient_id);

-- Is the signed-in user the doctor on any appointment of this patient?
create or replace function public.treats_patient(p_patient uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.appointments a
    join public.doctors d on d.id = a.doctor_id
    where a.patient_id = p_patient and d.user_id = auth.uid()
  );
$$;

create or replace function public.is_my_doctor_record(p_doctor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.doctors where id = p_doctor and user_id = auth.uid());
$$;

-- Doctors may update only status and notes of their own appointments.
create or replace function public.guard_appointment_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_front_desk(old.clinic_id) and (
       new.branch_id is distinct from old.branch_id or new.doctor_id is distinct from old.doctor_id
    or new.service_id is distinct from old.service_id or new.patient_id is distinct from old.patient_id
    or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
    or new.source is distinct from old.source
  ) then
    raise exception 'doctors can only change status and notes' using errcode = '42501';
  end if;
  return new;
end $$;

-- ─── Triggers ───────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['clinic_sites', 'branches', 'doctors', 'services', 'doctor_services',
                           'working_hours', 'time_off', 'patients', 'patient_clinical', 'appointments'] loop
    execute format('drop trigger if exists %1$s_guard_clinic on public.%1$s', t);
    execute format('create trigger %1$s_guard_clinic before update on public.%1$s
                    for each row execute function public.guard_clinic_id()', t);
  end loop;
  foreach t in array array['clinic_sites', 'patients', 'patient_clinical', 'appointments'] loop
    execute format('drop trigger if exists %1$s_touch on public.%1$s', t);
    execute format('create trigger %1$s_touch before update on public.%1$s
                    for each row execute function public.touch_updated_at()', t);
  end loop;
  -- Audit configuration and appointment changes (not patient records: no PII copies).
  foreach t in array array['clinic_sites', 'branches', 'doctors', 'services', 'working_hours', 'time_off', 'appointments'] loop
    execute format('drop trigger if exists %1$s_audit on public.%1$s', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s
                    for each row execute function public.audit_row()', t);
  end loop;
end $$;

drop trigger if exists appointments_guard_update on public.appointments;
create trigger appointments_guard_update before update on public.appointments
  for each row execute function public.guard_appointment_update();

-- ─── Row Level Security ─────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['clinic_sites', 'branches', 'doctors', 'services', 'doctor_services',
                           'working_hours', 'time_off', 'patients', 'patient_clinical', 'appointments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;

  -- Configuration: every member reads, owners/managers write.
  foreach t in array array['clinic_sites', 'branches', 'doctors', 'services', 'doctor_services',
                           'working_hours', 'time_off'] loop
    execute format('drop policy if exists "%1$s: members read" on public.%1$I', t);
    execute format('create policy "%1$s: members read" on public.%1$I for select to authenticated
                    using (public.is_platform_admin() or public.is_clinic_member(clinic_id))', t);
    execute format('drop policy if exists "%1$s: managers write" on public.%1$I', t);
    execute format('create policy "%1$s: managers write" on public.%1$I for all to authenticated
                    using (public.can_manage_clinic(clinic_id)) with check (public.can_manage_clinic(clinic_id))', t);
  end loop;
end $$;

-- clinic_sites rows are created by trigger only.
drop policy if exists "clinic_sites: managers write" on public.clinic_sites;
create policy "clinic_sites: managers update" on public.clinic_sites for update to authenticated
  using (public.can_manage_clinic(clinic_id)) with check (public.can_manage_clinic(clinic_id));
revoke insert, delete on public.clinic_sites from authenticated;

-- patients
drop policy if exists "patients: read" on public.patients;
create policy "patients: read" on public.patients for select to authenticated
  using (public.is_front_desk(clinic_id) or public.treats_patient(id));
drop policy if exists "patients: front desk insert" on public.patients;
create policy "patients: front desk insert" on public.patients for insert to authenticated
  with check (public.is_front_desk(clinic_id));
drop policy if exists "patients: front desk update" on public.patients;
create policy "patients: front desk update" on public.patients for update to authenticated
  using (public.is_front_desk(clinic_id)) with check (public.is_front_desk(clinic_id));
drop policy if exists "patients: managers delete" on public.patients;
create policy "patients: managers delete" on public.patients for delete to authenticated
  using (public.can_manage_clinic(clinic_id));

-- patient_clinical: never reception
drop policy if exists "clinical: clinicians" on public.patient_clinical;
create policy "clinical: clinicians" on public.patient_clinical for all to authenticated
  using (public.can_manage_clinic(clinic_id) or public.treats_patient(patient_id))
  with check (public.can_manage_clinic(clinic_id) or public.treats_patient(patient_id));

-- appointments
drop policy if exists "appointments: read" on public.appointments;
create policy "appointments: read" on public.appointments for select to authenticated
  using (public.is_front_desk(clinic_id) or public.is_my_doctor_record(doctor_id));
drop policy if exists "appointments: front desk insert" on public.appointments;
create policy "appointments: front desk insert" on public.appointments for insert to authenticated
  with check (public.is_front_desk(clinic_id));
drop policy if exists "appointments: update" on public.appointments;
create policy "appointments: update" on public.appointments for update to authenticated
  using (public.is_front_desk(clinic_id) or public.is_my_doctor_record(doctor_id))
  with check (public.is_front_desk(clinic_id) or public.is_my_doctor_record(doctor_id));
drop policy if exists "appointments: managers delete" on public.appointments;
create policy "appointments: managers delete" on public.appointments for delete to authenticated
  using (public.can_manage_clinic(clinic_id));

-- ─── Public functions (the only way visitors touch clinic data) ─────────────
-- Everything a clinic's public website needs, for published sites of active clinics only.
create or replace function public.public_site(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'clinic', jsonb_build_object('id', c.id, 'name', c.name, 'city', c.city),
    'site', jsonb_build_object(
      'slug', s.slug, 'template', s.template, 'brand', s.brand, 'content', s.content,
      'phone', s.phone, 'whatsapp', s.whatsapp, 'email', s.email, 'timezone', s.timezone,
      'booking_days_ahead', s.booking_days_ahead),
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

-- Open slots for a service on a local calendar day. Optional doctor / branch filters.
create or replace function public.available_slots(
  p_slug text, p_service uuid, p_day date, p_doctor uuid default null, p_branch uuid default null
) returns table (doctor_id uuid, branch_id uuid, starts_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with site as (
    select s.clinic_id, s.timezone, s.slot_minutes, s.min_notice_minutes, s.booking_days_ahead,
           (now() at time zone s.timezone)::date as today
    from public.clinic_sites s join public.clinics c on c.id = s.clinic_id
    where s.slug = p_slug and s.published and c.status = 'active'
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
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(c.starts_at, c.starts_at + svc.len))
    and not exists (
      select 1 from public.time_off t
      where t.clinic_id = site.clinic_id and (t.doctor_id is null or t.doctor_id = c.doctor_id)
        and tstzrange(t.starts_at, t.ends_at) && tstzrange(c.starts_at, c.starts_at + svc.len))
  order by c.starts_at, c.doctor_id;
$$;

-- Book from the public site. Re-validates the slot, reuses the patient by phone,
-- and caps open website bookings per phone to limit abuse.
create or replace function public.book_appointment(
  p_slug text, p_service uuid, p_doctor uuid, p_branch uuid, p_starts_at timestamptz,
  p_full_name text, p_phone text, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_clinic uuid;
  v_phone text := public.normalize_sa_mobile(p_phone);
  v_name text := btrim(p_full_name);
  v_len interval;
  v_patient uuid;
  v_appt uuid;
begin
  if v_phone is null then raise exception 'invalid_phone' using errcode = '22023'; end if;
  if char_length(coalesce(v_name, '')) not between 2 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if char_length(coalesce(p_notes, '')) > 500 then raise exception 'invalid_notes' using errcode = '22023'; end if;

  select s.clinic_id into v_clinic
  from public.clinic_sites s join public.clinics c on c.id = s.clinic_id
  where s.slug = p_slug and s.published and c.status = 'active';
  if v_clinic is null then raise exception 'clinic_not_found' using errcode = 'P0002'; end if;

  if not exists (
    select 1 from public.available_slots(
      p_slug, p_service,
      (p_starts_at at time zone (select timezone from public.clinic_sites where clinic_id = v_clinic))::date,
      p_doctor, p_branch) s
    where s.starts_at = p_starts_at and s.doctor_id = p_doctor and s.branch_id = p_branch
  ) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;

  select make_interval(mins => duration_minutes) into v_len from public.services where id = p_service;

  insert into public.patients (clinic_id, full_name, phone, source)
  values (v_clinic, v_name, v_phone, 'website')
  on conflict (clinic_id, phone) do nothing;
  select id into v_patient from public.patients where clinic_id = v_clinic and phone = v_phone;

  if (select count(*) from public.appointments
      where patient_id = v_patient and source = 'website'
        and status in ('pending', 'confirmed') and starts_at > now()) >= 3 then
    raise exception 'too_many_bookings' using errcode = 'P0001';
  end if;

  begin
    insert into public.appointments
      (clinic_id, branch_id, doctor_id, service_id, patient_id, starts_at, ends_at, source, notes)
    values
      (v_clinic, p_branch, p_doctor, p_service, v_patient, p_starts_at, p_starts_at + v_len, 'website',
       nullif(btrim(p_notes), ''))
    returning id into v_appt;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0001'; -- lost a race with another booking
  end;

  return jsonb_build_object(
    'id', v_appt,
    'starts_at', p_starts_at,
    'service', (select name from public.services where id = p_service),
    'doctor', (select full_name from public.doctors where id = p_doctor),
    'branch', (select name from public.branches where id = p_branch)
  );
end $$;

revoke execute on function public.public_site(text) from public;
revoke execute on function public.available_slots(text, uuid, date, uuid, uuid) from public;
revoke execute on function public.book_appointment(text, uuid, uuid, uuid, timestamptz, text, text, text) from public;
grant execute on function public.public_site(text) to anon, authenticated;
grant execute on function public.available_slots(text, uuid, date, uuid, uuid) to anon, authenticated;
grant execute on function public.book_appointment(text, uuid, uuid, uuid, timestamptz, text, text, text) to anon, authenticated;

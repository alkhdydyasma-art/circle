-- Circle — full database setup (all migrations in order). Paste into Supabase → SQL Editor → Run.
-- Generated from supabase/migrations/*.sql — do not edit by hand.

-- ════ supabase/migrations/20260924000000_leads.sql ════
-- Demo requests from the Circle website.
-- Written only by the server (service role) via /api/lead. RLS is on with no
-- policies, so the public anon key and signed-in users can neither read nor write.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'demo_scheduled', 'won', 'lost')),

  clinic text not null check (char_length(clinic) <= 120),
  city text not null check (char_length(city) <= 80),
  clinic_type text not null
    check (clinic_type in ('general', 'ortho', 'cosmetic', 'pediatric', 'multi')),
  branches int not null check (branches between 1 and 500),
  chairs int not null check (chairs between 1 and 500),
  doctors int not null check (doctors between 1 and 500),
  booking_method text not null
    check (booking_method in ('phone', 'whatsapp', 'software', 'paper')),
  monthly_patients text not null
    check (monthly_patients in ('lt200', '200_500', '500_1000', 'gt1000')),
  needs text[] not null default '{}',

  contact_name text not null check (char_length(contact_name) <= 120),
  contact_role text not null check (contact_role in ('owner', 'manager', 'doctor', 'reception')),
  phone text not null check (phone ~ '^\+9665[0-9]{8}$'),
  email text check (email is null or char_length(email) <= 160),
  consent_at timestamptz not null,
  lang text not null default 'ar' check (lang in ('ar', 'en')),
  source text not null default 'circle-website'
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_status_idx on public.leads (status);

alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;

-- ════ supabase/migrations/20260925000000_clinic_portal.sql ════
-- Circle portal: multi-tenant clinics, team roles, invitations and audit log.
--
-- Isolation model
--   * Every tenant-owned row carries clinic_id.
--   * RLS policies call the helpers below, so a user only ever sees rows of clinics
--     they belong to — enforced by Postgres, not by application code.
--   * Platform admins (Circle staff) are listed in platform_admins and see everything.
--   * The anon role has no access to any of these tables.

-- ─── Types ──────────────────────────────────────────────────────────────────
do $$ begin
  create type public.clinic_role as enum ('owner', 'manager', 'doctor', 'reception');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.clinic_status as enum ('pending', 'active', 'suspended');
exception when duplicate_object then null; end $$;

-- ─── Tables ─────────────────────────────────────────────────────────────────
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 120),
  city text not null check (char_length(city) between 1 and 80),
  clinic_type text not null
    check (clinic_type in ('general', 'ortho', 'cosmetic', 'pediatric', 'multi')),
  status public.clinic_status not null default 'pending',
  plan text not null default 'standard' check (plan in ('starter', 'standard', 'pro')),
  platform text not null check (platform in ('smart_clinic', 'medent')),
  platform_url text check (platform_url is null or platform_url ~ '^https://'),
  lead_id uuid unique references public.leads (id) on delete set null
);

create table if not exists public.clinic_members (
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.clinic_role not null,
  created_at timestamptz not null default now(),
  primary key (clinic_id, user_id)
);
create index if not exists clinic_members_user_idx on public.clinic_members (user_id);

create table if not exists public.clinic_invitations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 160),
  role public.clinic_role not null,
  -- Only the SHA-256 of the token is stored; the raw token lives in the invite link.
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz
);
create index if not exists clinic_invitations_clinic_idx on public.clinic_invitations (clinic_id);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  clinic_id uuid, -- no FK: the trail must outlive the clinic it describes
  actor uuid,
  action text not null,
  details jsonb not null default '{}'
);
create index if not exists audit_log_clinic_idx on public.audit_log (clinic_id, created_at desc);

-- ─── Helpers (SECURITY DEFINER so policies don't recurse into RLS) ───────────
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.clinic_role_of(p_clinic uuid)
returns public.clinic_role language sql stable security definer set search_path = '' as $$
  select role from public.clinic_members where clinic_id = p_clinic and user_id = auth.uid();
$$;

create or replace function public.is_clinic_member(p_clinic uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.clinic_role_of(p_clinic) is not null;
$$;

create or replace function public.can_manage_clinic(p_clinic uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin()
      or public.clinic_role_of(p_clinic) in ('owner', 'manager');
$$;

-- A manager may manage doctors/reception; only owners (or admins) touch owner/manager seats.
create or replace function public.can_assign_role(p_clinic uuid, p_role public.clinic_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin()
      or public.clinic_role_of(p_clinic) = 'owner'
      or (public.clinic_role_of(p_clinic) = 'manager' and p_role in ('doctor', 'reception'));
$$;

-- ─── Row Level Security ─────────────────────────────────────────────────────
alter table public.platform_admins enable row level security;
alter table public.clinics enable row level security;
alter table public.clinic_members enable row level security;
alter table public.clinic_invitations enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.platform_admins, public.clinics, public.clinic_members,
  public.clinic_invitations, public.audit_log from anon;
revoke all on public.platform_admins, public.clinics, public.clinic_members,
  public.clinic_invitations, public.audit_log from authenticated;

grant select on public.platform_admins to authenticated;
grant select, insert, update on public.clinics to authenticated;
grant select, insert, update, delete on public.clinic_members to authenticated;
grant select, insert, delete on public.clinic_invitations to authenticated;
grant select on public.audit_log to authenticated;
grant select, update (status) on public.leads to authenticated;

-- platform_admins: you can see only whether *you* are an admin.
drop policy if exists "admins: self" on public.platform_admins;
create policy "admins: self" on public.platform_admins
  for select to authenticated using (user_id = auth.uid());

-- leads: Circle staff only.
drop policy if exists "leads: admin read" on public.leads;
create policy "leads: admin read" on public.leads
  for select to authenticated using (public.is_platform_admin());
drop policy if exists "leads: admin update" on public.leads;
create policy "leads: admin update" on public.leads
  for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- clinics
drop policy if exists "clinics: members read" on public.clinics;
create policy "clinics: members read" on public.clinics
  for select to authenticated using (public.is_platform_admin() or public.is_clinic_member(id));
drop policy if exists "clinics: admin create" on public.clinics;
create policy "clinics: admin create" on public.clinics
  for insert to authenticated with check (public.is_platform_admin());
drop policy if exists "clinics: managers update" on public.clinics;
create policy "clinics: managers update" on public.clinics
  for update to authenticated using (public.can_manage_clinic(id)) with check (public.can_manage_clinic(id));

-- clinic_members
drop policy if exists "members: same clinic read" on public.clinic_members;
create policy "members: same clinic read" on public.clinic_members
  for select to authenticated using (public.is_platform_admin() or public.is_clinic_member(clinic_id));
drop policy if exists "members: add" on public.clinic_members;
create policy "members: add" on public.clinic_members
  for insert to authenticated with check (public.can_assign_role(clinic_id, role));
drop policy if exists "members: change role" on public.clinic_members;
create policy "members: change role" on public.clinic_members
  for update to authenticated
  using (public.can_assign_role(clinic_id, role))
  with check (public.can_assign_role(clinic_id, role));
drop policy if exists "members: remove" on public.clinic_members;
create policy "members: remove" on public.clinic_members
  for delete to authenticated using (public.can_assign_role(clinic_id, role));

-- clinic_invitations
drop policy if exists "invites: managers read" on public.clinic_invitations;
create policy "invites: managers read" on public.clinic_invitations
  for select to authenticated using (public.can_manage_clinic(clinic_id));
drop policy if exists "invites: create" on public.clinic_invitations;
create policy "invites: create" on public.clinic_invitations
  for insert to authenticated
  with check (public.can_assign_role(clinic_id, role) and invited_by = auth.uid() and accepted_at is null);
drop policy if exists "invites: revoke" on public.clinic_invitations;
create policy "invites: revoke" on public.clinic_invitations
  for delete to authenticated using (public.can_assign_role(clinic_id, role));

-- audit_log: owners/managers read their clinic's trail; rows are written by triggers only.
drop policy if exists "audit: managers read" on public.audit_log;
create policy "audit: managers read" on public.audit_log
  for select to authenticated using (public.can_manage_clinic(clinic_id));

-- ─── Guards ─────────────────────────────────────────────────────────────────
-- Commercial fields (status, plan, platform, lead) are changed by Circle staff only.
create or replace function public.guard_clinic_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() and (
       new.status is distinct from old.status
    or new.plan is distinct from old.plan
    or new.platform is distinct from old.platform
    or new.platform_url is distinct from old.platform_url
    or new.lead_id is distinct from old.lead_id
  ) then
    raise exception 'only Circle staff can change subscription fields' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists clinics_guard on public.clinics;
create trigger clinics_guard before update on public.clinics
  for each row execute function public.guard_clinic_update();

-- Nobody can move a member to another clinic or another user, and every clinic keeps an owner.
create or replace function public.guard_member_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.clinic_id <> old.clinic_id or new.user_id <> old.user_id then
      raise exception 'membership cannot be moved' using errcode = '42501';
    end if;
    if not public.can_assign_role(new.clinic_id, new.role) then
      raise exception 'not allowed to grant role %', new.role using errcode = '42501';
    end if;
  end if;

  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (
       select 1 from public.clinic_members
       where clinic_id = old.clinic_id and role = 'owner' and user_id <> old.user_id
     )
     and exists (select 1 from public.clinics where id = old.clinic_id) then
    raise exception 'a clinic must keep at least one owner' using errcode = '23514';
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists clinic_members_guard on public.clinic_members;
create trigger clinic_members_guard before update or delete on public.clinic_members
  for each row execute function public.guard_member_change();

-- ─── Audit trail ────────────────────────────────────────────────────────────
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  -- Never write invitation token hashes into the audit trail.
  rec := rec - 'token_hash';
  insert into public.audit_log (clinic_id, actor, action, details)
  values (
    coalesce((rec ->> 'clinic_id')::uuid, (rec ->> 'id')::uuid),
    auth.uid(),
    tg_table_name || '.' || lower(tg_op),
    case when tg_op = 'UPDATE'
      then jsonb_build_object('old', to_jsonb(old) - 'token_hash', 'new', rec)
      else rec end
  );
  return coalesce(new, old);
end $$;

drop trigger if exists clinics_audit on public.clinics;
create trigger clinics_audit after insert or update on public.clinics
  for each row execute function public.audit_row();
drop trigger if exists clinic_members_audit on public.clinic_members;
create trigger clinic_members_audit after insert or update or delete on public.clinic_members
  for each row execute function public.audit_row();
drop trigger if exists clinic_invitations_audit on public.clinic_invitations;
create trigger clinic_invitations_audit after insert or delete on public.clinic_invitations
  for each row execute function public.audit_row();

-- ─── RPCs ───────────────────────────────────────────────────────────────────
-- Staff: turn a lead into a pending clinic and an owner invitation.
create or replace function public.activate_lead(
  p_lead uuid, p_owner_email text, p_platform text, p_token_hash text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  l public.leads;
  new_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into l from public.leads where id = p_lead for update;
  if not found then raise exception 'lead not found' using errcode = 'P0002'; end if;

  insert into public.clinics (name, city, clinic_type, platform, lead_id)
  values (l.clinic, l.city, l.clinic_type, p_platform, l.id)
  returning id into new_id;

  insert into public.clinic_invitations (clinic_id, email, role, token_hash, invited_by)
  values (new_id, lower(trim(p_owner_email)), 'owner', p_token_hash, auth.uid());

  update public.leads set status = 'won' where id = l.id;
  return new_id;
end $$;

-- Invitee: redeem a token. The signed-in email must match the invitation.
create or replace function public.accept_invitation(p_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  inv public.clinic_invitations;
  my_email text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;

  select * into inv from public.clinic_invitations
  where token_hash = p_token_hash for update;

  if not found or inv.accepted_at is not null or inv.expires_at < now() then
    raise exception 'invitation invalid or expired' using errcode = 'P0002';
  end if;
  if inv.email <> my_email then
    raise exception 'invitation belongs to another email' using errcode = '42501';
  end if;

  insert into public.clinic_members (clinic_id, user_id, role)
  values (inv.clinic_id, auth.uid(), inv.role)
  on conflict (clinic_id, user_id) do update set role = excluded.role;

  update public.clinic_invitations set accepted_at = now() where id = inv.id;
  return inv.clinic_id;
end $$;

-- Pre-login check for the invite page: returns only non-sensitive fields.
create or replace function public.peek_invitation(p_token_hash text)
returns table (clinic_name text, email text, role public.clinic_role)
language sql stable security definer set search_path = '' as $$
  select c.name, i.email, i.role
  from public.clinic_invitations i join public.clinics c on c.id = i.clinic_id
  where i.token_hash = p_token_hash and i.accepted_at is null and i.expires_at > now();
$$;

-- Team list with emails (auth.users is not exposed directly).
create or replace function public.clinic_team(p_clinic uuid)
returns table (user_id uuid, email text, role public.clinic_role, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.clinic_members m join auth.users u on u.id = m.user_id
  where m.clinic_id = p_clinic
    and (public.is_platform_admin() or public.is_clinic_member(p_clinic))
  order by m.created_at;
$$;

revoke execute on function public.activate_lead(uuid, text, text, text) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
revoke execute on function public.clinic_team(uuid) from public, anon;
grant execute on function public.activate_lead(uuid, text, text, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.clinic_team(uuid) to authenticated;
grant execute on function public.peek_invitation(text) to anon, authenticated;

-- ════ supabase/migrations/20260926000000_clinic_data.sql ════
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

-- ════ supabase/migrations/20260927000000_occasion_templates.sql ════
-- Replace the "calm" and "premium" templates with occasion themes:
--   founding_day  (يوم التأسيس — 22 February)
--   national_day  (اليوم الوطني — 23 September)

alter table public.clinic_sites drop constraint if exists clinic_sites_template_check;

update public.clinic_sites set template = 'founding_day' where template = 'calm';
update public.clinic_sites set template = 'national_day' where template = 'premium';

alter table public.clinic_sites add constraint clinic_sites_template_check
  check (template in ('modern', 'founding_day', 'national_day'));

-- ════ supabase/migrations/20260928000000_automation.sql ════
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


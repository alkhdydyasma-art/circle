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

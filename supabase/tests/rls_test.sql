-- Tenant-isolation and permission tests for the Circle portal.
-- Run on a scratch database: auth_stub.sql → migrations/* → this file.
-- Every check raises (and aborts the run) if isolation is broken.
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- Act as a user: sets the JWT claims Supabase would and switches to its DB role.
create or replace function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  if p_email is null then
    perform set_config('request.jwt.claims', '', false);
    execute 'set role anon';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', (select id from auth.users where email = p_email), 'email', p_email)::text, false);
    execute 'set role authenticated';
  end if;
end $$;

-- Expect a statement to be blocked: an error (permission, RLS check, guard trigger)
-- or, for UPDATE/DELETE filtered out by RLS, zero affected rows.
create or replace function pg_temp.expect_fail(p_label text, p_sql text) returns void language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n = 0 and p_sql ~* '^\s*(update|delete)' then
    raise notice 'ok (0 rows): %', p_label;
    return;
  end if;
  raise exception 'SECURITY FAIL: % — statement succeeded: %', p_label, p_sql;
exception
  when raise_exception then
    if sqlerrm like 'SECURITY FAIL%' then raise; end if;
    raise notice 'ok (blocked): %', p_label;
  when others then
    raise notice 'ok (blocked): % [%]', p_label, sqlstate;
end $$;

create or replace function pg_temp.expect_eq(p_label text, p_sql text, p_expected bigint) returns void language plpgsql as $$
declare got bigint;
begin
  execute p_sql into got;
  if got is distinct from p_expected then
    raise exception 'SECURITY FAIL: % — expected %, got %', p_label, p_expected, got;
  end if;
  raise notice 'ok: % = %', p_label, got;
end $$;

grant execute on all functions in schema pg_temp to anon, authenticated;

-- ─── Fixtures (as superuser) ────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@circle.sa'),
  ('00000000-0000-0000-0000-000000000001', 'owner1@noor.sa'),
  ('00000000-0000-0000-0000-000000000002', 'manager1@noor.sa'),
  ('00000000-0000-0000-0000-000000000003', 'doctor1@noor.sa'),
  ('00000000-0000-0000-0000-000000000004', 'owner2@smile.sa'),
  ('00000000-0000-0000-0000-000000000005', 'stranger@evil.sa');
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-00000000000a');

insert into public.leads (id, clinic, city, clinic_type, branches, chairs, doctors, booking_method,
  monthly_patients, contact_name, contact_role, phone, consent_at) values
  ('10000000-0000-0000-0000-000000000001', 'Noor Dental', 'Jeddah', 'general', 1, 4, 3, 'phone', 'lt200', 'Khalid', 'owner', '+966500000001', now()),
  ('10000000-0000-0000-0000-000000000002', 'Smile Center', 'Riyadh', 'ortho', 2, 8, 5, 'whatsapp', '200_500', 'Sara', 'owner', '+966500000002', now());

-- ─── Activation by Circle staff ─────────────────────────────────────────────
select pg_temp.act_as('stranger@evil.sa');
select pg_temp.expect_fail('non-admin cannot activate a lead',
  $$select public.activate_lead('10000000-0000-0000-0000-000000000001', 'x@x.sa', 'smart_clinic', 'hx')$$);

select pg_temp.act_as('admin@circle.sa');
select public.activate_lead('10000000-0000-0000-0000-000000000001', 'Owner1@Noor.sa', 'smart_clinic', 'h-owner1') is not null;
select public.activate_lead('10000000-0000-0000-0000-000000000002', 'owner2@smile.sa', 'medent', 'h-owner2') is not null;
select pg_temp.expect_eq('admin sees both clinics', 'select count(*) from public.clinics', 2);
select pg_temp.expect_eq('activated leads marked won', $$select count(*) from public.leads where status = 'won'$$, 2);

-- ─── Invitation acceptance ──────────────────────────────────────────────────
select pg_temp.act_as('owner2@smile.sa');
select pg_temp.expect_fail('cannot redeem an invitation addressed to another email',
  $$select public.accept_invitation('h-owner1')$$);
select public.accept_invitation('h-owner2') is not null;

select pg_temp.act_as('owner1@noor.sa');
select public.accept_invitation('h-owner1') is not null;
select pg_temp.expect_fail('an invitation cannot be redeemed twice',
  $$select public.accept_invitation('h-owner1')$$);

-- ─── Cross-tenant isolation ─────────────────────────────────────────────────
select pg_temp.expect_eq('owner1 sees only own clinic', 'select count(*) from public.clinics', 1);
select pg_temp.expect_eq('owner1 cannot read clinic 2 by name',
  $$select count(*) from public.clinics where name = 'Smile Center'$$, 0);
select pg_temp.expect_eq('owner1 sees no leads', 'select count(*) from public.leads', 0);
select pg_temp.expect_eq('owner1 sees only own team',
  'select count(*) from public.clinic_members', 1);
reset role;
create temp table ids as select id, name from public.clinics;
grant select on ids to authenticated, anon;
select pg_temp.act_as('owner1@noor.sa');
select pg_temp.expect_eq('owner1 gets empty team list for clinic 2',
  $$select count(*) from public.clinic_team((select id from ids where name = 'Smile Center'))$$, 0);
select pg_temp.expect_fail('owner1 cannot add himself to clinic 2',
  $$insert into public.clinic_members (clinic_id, user_id, role)
    values ((select id from ids where name = 'Smile Center'), auth.uid(), 'owner')$$);
select pg_temp.expect_fail('owner1 cannot invite into clinic 2',
  $$insert into public.clinic_invitations (clinic_id, email, role, token_hash, invited_by)
    values ((select id from ids where name = 'Smile Center'), 'spy@evil.sa', 'owner', 'h-spy', auth.uid())$$);
select pg_temp.expect_eq('owner1 update on clinic 2 touches 0 rows',
  $$with u as (update public.clinics set name = 'hacked' where name = 'Smile Center' returning 1) select count(*) from u$$, 0);
select pg_temp.expect_eq('owner1 sees no audit rows of clinic 2',
  $$select count(*) from public.audit_log where clinic_id = (select id from ids where name = 'Smile Center')$$, 0);

-- ─── Roles inside a clinic ──────────────────────────────────────────────────
insert into public.clinic_invitations (clinic_id, email, role, token_hash, invited_by)
values ((select id from ids where name = 'Noor Dental'), 'manager1@noor.sa', 'manager', 'h-manager1', auth.uid()),
       ((select id from ids where name = 'Noor Dental'), 'doctor1@noor.sa', 'doctor', 'h-doctor1', auth.uid());

select pg_temp.act_as('doctor1@noor.sa');
select pg_temp.expect_fail('doctor cannot take the manager invitation',
  $$select public.accept_invitation('h-manager1')$$);
select public.accept_invitation('h-doctor1') is not null;
select pg_temp.act_as('manager1@noor.sa');
select public.accept_invitation('h-manager1') is not null;

-- manager
select pg_temp.expect_fail('manager cannot invite an owner',
  $$insert into public.clinic_invitations (clinic_id, email, role, token_hash, invited_by)
    values ((select id from ids where name = 'Noor Dental'), 'o@x.sa', 'owner', 'h-o', auth.uid())$$);
select pg_temp.expect_fail('manager cannot invite another manager',
  $$insert into public.clinic_invitations (clinic_id, email, role, token_hash, invited_by)
    values ((select id from ids where name = 'Noor Dental'), 'm@x.sa', 'manager', 'h-m', auth.uid())$$);
insert into public.clinic_invitations (clinic_id, email, role, token_hash, invited_by)
values ((select id from ids where name = 'Noor Dental'), 'reception@noor.sa', 'reception', 'h-reception', auth.uid());
select pg_temp.expect_fail('manager cannot promote self to owner',
  $$update public.clinic_members set role = 'owner' where user_id = auth.uid()$$);
select pg_temp.expect_eq('manager is still a manager',
  $$select count(*) from public.clinic_members where user_id = auth.uid() and role = 'manager'$$, 1);
select pg_temp.expect_eq('manager cannot remove the owner (0 rows)',
  $$with d as (delete from public.clinic_members where role = 'owner' returning 1) select count(*) from d$$, 0);
select pg_temp.expect_fail('manager cannot change subscription status',
  $$update public.clinics set status = 'active'$$);
select pg_temp.expect_eq('manager can rename the clinic',
  $$with u as (update public.clinics set name = 'Noor Dental Clinic' returning 1) select count(*) from u$$, 1);
reset role;
update ids set name = 'Noor Dental Clinic' where name = 'Noor Dental';

-- doctor
select pg_temp.act_as('doctor1@noor.sa');
select pg_temp.expect_eq('doctor sees own clinic', 'select count(*) from public.clinics', 1);
select pg_temp.expect_eq('doctor sees the team', 'select count(*) from public.clinic_members', 3);
select pg_temp.expect_eq('doctor sees no invitations', 'select count(*) from public.clinic_invitations', 0);
select pg_temp.expect_eq('doctor sees no audit log', 'select count(*) from public.audit_log', 0);
select pg_temp.expect_eq('doctor cannot rename the clinic (0 rows)',
  $$with u as (update public.clinics set name = 'x' returning 1) select count(*) from u$$, 0);
select pg_temp.expect_fail('doctor cannot invite anyone',
  $$insert into public.clinic_invitations (clinic_id, email, role, token_hash, invited_by)
    values ((select id from ids where name = 'Noor Dental Clinic'), 'r@x.sa', 'reception', 'h-r', auth.uid())$$);
select pg_temp.expect_fail('doctor cannot promote self',
  $$update public.clinic_members set role = 'manager' where user_id = auth.uid()$$);
select pg_temp.expect_eq('doctor is still a doctor',
  $$select count(*) from public.clinic_members where user_id = auth.uid() and role = 'doctor'$$, 1);

-- owner
select pg_temp.act_as('owner1@noor.sa');
select pg_temp.expect_fail('last owner cannot demote self',
  $$update public.clinic_members set role = 'manager' where user_id = auth.uid()$$);
select pg_temp.expect_fail('last owner cannot leave',
  $$delete from public.clinic_members where user_id = auth.uid()$$);
select pg_temp.expect_fail('owner cannot move a member to another clinic',
  $$update public.clinic_members set clinic_id = (select id from ids where name = 'Smile Center')
    where user_id = '00000000-0000-0000-0000-000000000003'$$);
select pg_temp.expect_fail('owner cannot change the plan',
  $$update public.clinics set plan = 'pro'$$);
select pg_temp.expect_eq('owner can change doctor to reception',
  $$with u as (update public.clinic_members set role = 'reception'
     where user_id = '00000000-0000-0000-0000-000000000003' returning 1) select count(*) from u$$, 1);
select pg_temp.expect_eq('owner sees own clinic audit trail',
  $$select (count(*) > 0)::int from public.audit_log where clinic_id = (select id from ids where name = 'Noor Dental Clinic')$$, 1);
select pg_temp.expect_eq('audit trail never contains token hashes',
  $$select count(*) from public.audit_log where details::text like '%h-%'$$, 0);

-- ─── Anonymous visitors ─────────────────────────────────────────────────────
select pg_temp.act_as(null);
select pg_temp.expect_fail('anon cannot read clinics', 'select count(*) from public.clinics');
select pg_temp.expect_fail('anon cannot read leads', 'select count(*) from public.leads');
select pg_temp.expect_fail('anon cannot read members', 'select count(*) from public.clinic_members');
select pg_temp.expect_fail('anon cannot accept invitations', $$select public.accept_invitation('h-reception')$$);
select pg_temp.expect_eq('anon can peek a pending invitation', $$select count(*) from public.peek_invitation('h-reception')$$, 1);
select pg_temp.expect_eq('anon cannot peek an accepted invitation', $$select count(*) from public.peek_invitation('h-owner1')$$, 0);

-- ─── Expiry ─────────────────────────────────────────────────────────────────
reset role;
update public.clinic_invitations set expires_at = now() - interval '1 minute' where token_hash = 'h-reception';
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000006', 'reception@noor.sa');
select pg_temp.act_as('reception@noor.sa');
select pg_temp.expect_fail('expired invitation cannot be redeemed', $$select public.accept_invitation('h-reception')$$);

reset role;
select 'ALL TENANT-ISOLATION TESTS PASSED' as result;

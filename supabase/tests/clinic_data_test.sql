-- Clinic data: tenant isolation, role matrix, clinical privacy and public booking.
\set ON_ERROR_STOP on
set client_min_messages = notice;
set timezone = 'UTC';

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
    raise notice 'ok (blocked): % [%]', p_label, sqlerrm;
  when others then
    raise notice 'ok (blocked): % [%]', p_label, sqlerrm;
end $$;

create or replace function pg_temp.expect_eq(p_label text, p_sql text, p_expected bigint) returns void language plpgsql as $$
declare got bigint;
begin
  execute p_sql into got;
  if got is distinct from p_expected then
    raise exception 'FAIL: % — expected %, got %', p_label, p_expected, got;
  end if;
  raise notice 'ok: % = %', p_label, got;
end $$;

grant execute on all functions in schema pg_temp to anon, authenticated;

-- ─── Fixtures (superuser) ───────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@noor.sa'),
  ('00000000-0000-0000-0000-0000000000a2', 'reception@noor.sa'),
  ('00000000-0000-0000-0000-0000000000a3', 'drsara@noor.sa'),
  ('00000000-0000-0000-0000-0000000000a4', 'drali@noor.sa'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner@smile.sa');

insert into public.clinics (id, name, city, clinic_type, status) values
  ('c0000000-0000-0000-0000-00000000000a', 'Noor Dental', 'Jeddah', 'general', 'active'),
  ('c0000000-0000-0000-0000-00000000000b', 'Smile Center', 'Riyadh', 'ortho', 'active');

insert into public.clinic_members (clinic_id, user_id, role) values
  ('c0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('c0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'reception'),
  ('c0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a3', 'doctor'),
  ('c0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a4', 'doctor'),
  ('c0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'owner');

select pg_temp.expect_eq('each new clinic got a draft site', 'select count(*) from public.clinic_sites where not published', 2);
update public.clinic_sites set slug = 'noor', published = true, slot_minutes = 30, min_notice_minutes = 0
  where clinic_id = 'c0000000-0000-0000-0000-00000000000a';
update public.clinic_sites set slug = 'smile' where clinic_id = 'c0000000-0000-0000-0000-00000000000b';

-- Tomorrow in Riyadh: deterministic weekday, no "min notice" edge cases.
create temp table d as select ((now() at time zone 'Asia/Riyadh')::date + 1) as day;
grant select on d to anon, authenticated;

-- ─── Owner builds the clinic configuration (through RLS) ────────────────────
select pg_temp.act_as('owner@noor.sa');
insert into public.branches (id, clinic_id, name, city) values
  ('b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'Olaya', 'Jeddah');
insert into public.services (id, clinic_id, name, duration_minutes, price) values
  ('50000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'Cleaning', 30, 300),
  ('50000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-00000000000a', 'Hidden', 30, 1);
update public.services set is_active = false where name = 'Hidden';
insert into public.doctors (id, clinic_id, full_name, user_id) values
  ('d0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'Dr. Sara', '00000000-0000-0000-0000-0000000000a3'),
  ('d0000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-00000000000a', 'Dr. Ali', '00000000-0000-0000-0000-0000000000a4');
insert into public.doctor_services (clinic_id, doctor_id, service_id) values
  ('c0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a'),
  ('c0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000c', '50000000-0000-0000-0000-00000000000a');
insert into public.working_hours (clinic_id, doctor_id, branch_id, weekday, start_time, end_time)
select 'c0000000-0000-0000-0000-00000000000a', doc, 'b0000000-0000-0000-0000-00000000000a',
       extract(dow from (select day from d)), '09:00', '12:00'
from unnest(array['d0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000c']::uuid[]) doc;

select pg_temp.expect_fail('doctor record cannot link a user from another clinic',
  $$insert into public.doctors (clinic_id, full_name, user_id)
    values ('c0000000-0000-0000-0000-00000000000a', 'Spy', '00000000-0000-0000-0000-0000000000b1')$$);

-- Smile Center (owner 2)
select pg_temp.act_as('owner@smile.sa');
insert into public.branches (id, clinic_id, name) values
  ('b0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', 'Malqa');
insert into public.services (id, clinic_id, name) values
  ('50000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', 'Braces');
insert into public.doctors (id, clinic_id, full_name) values
  ('d0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', 'Dr. Omar');
insert into public.patients (id, clinic_id, full_name, phone) values
  ('e0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', 'Smile Patient', '+966511111111');

-- ─── Cross-tenant isolation ─────────────────────────────────────────────────
select pg_temp.expect_eq('owner2 sees only own services', 'select count(*) from public.services', 1);
select pg_temp.expect_eq('owner2 sees only own doctors', 'select count(*) from public.doctors', 1);
select pg_temp.expect_eq('owner2 sees only own sites', 'select count(*) from public.clinic_sites', 1);
select pg_temp.expect_fail('cannot link own doctor to another clinic''s service',
  $$insert into public.doctor_services (clinic_id, doctor_id, service_id)
    values ('c0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-00000000000a')$$);
select pg_temp.expect_fail('cannot book own patient with another clinic''s doctor',
  $$insert into public.appointments (clinic_id, branch_id, doctor_id, service_id, patient_id, starts_at, ends_at)
    values ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000a',
            '50000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-00000000000b', now() + interval '1 day', now() + interval '25 hours')$$);
select pg_temp.expect_fail('cannot write into another clinic',
  $$insert into public.services (clinic_id, name) values ('c0000000-0000-0000-0000-00000000000a', 'Injected')$$);
select pg_temp.expect_fail('cannot move own row to another clinic',
  $$update public.services set clinic_id = 'c0000000-0000-0000-0000-00000000000a' where name = 'Braces'$$);
select pg_temp.expect_fail('cannot create site rows directly',
  $$insert into public.clinic_sites (clinic_id, slug) values ('c0000000-0000-0000-0000-00000000000b', 'dup-site')$$);

-- ─── Anonymous visitors: functions only ─────────────────────────────────────
select pg_temp.act_as(null);
select pg_temp.expect_fail('anon cannot read patients', 'select count(*) from public.patients');
select pg_temp.expect_fail('anon cannot read appointments', 'select count(*) from public.appointments');
select pg_temp.expect_fail('anon cannot read doctors table', 'select count(*) from public.doctors');
select pg_temp.expect_eq('published site is public', $$select count(*) from public.public_site('noor') s where s is not null$$, 1);
select pg_temp.expect_eq('draft site is hidden', $$select count(*) from public.public_site('smile') s where s is not null$$, 0);
select pg_temp.expect_eq('public site lists only active services',
  $$select jsonb_array_length(public.public_site('noor') -> 'services')$$, 1);
select pg_temp.expect_eq('public site never exposes doctor user ids',
  $$select count(*) from jsonb_array_elements(public.public_site('noor') -> 'doctors') x where x ? 'user_id'$$, 0);

select pg_temp.expect_eq('6 slots × 2 doctors (09:00–12:00, 30 min)',
  $$select count(*) from public.available_slots('noor', '50000000-0000-0000-0000-00000000000a', (select day from d))$$, 12);
select pg_temp.expect_eq('doctor filter',
  $$select count(*) from public.available_slots('noor', '50000000-0000-0000-0000-00000000000a', (select day from d), 'd0000000-0000-0000-0000-00000000000a')$$, 6);
select pg_temp.expect_eq('no slots for inactive service',
  $$select count(*) from public.available_slots('noor', '50000000-0000-0000-0000-00000000000c', (select day from d))$$, 0);
select pg_temp.expect_eq('no slots on a closed day',
  $$select count(*) from public.available_slots('noor', '50000000-0000-0000-0000-00000000000a', (select day + 1 from d))$$, 0);
select pg_temp.expect_eq('no slots for draft site',
  $$select count(*) from public.available_slots('smile', '50000000-0000-0000-0000-00000000000b', (select day from d))$$, 0);

-- 10:00 Riyadh with Dr. Sara
create temp table slot as
  select (((select day from d) + time '10:00') at time zone 'Asia/Riyadh') as at;
grant select on slot to anon, authenticated;

select (public.book_appointment('noor', '50000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000a',
  'b0000000-0000-0000-0000-00000000000a', (select at from slot), 'Khalid', '053 068 9203', 'first visit') ->> 'doctor') = 'Dr. Sara';
select pg_temp.expect_eq('booked slot disappears',
  $$select count(*) from public.available_slots('noor', '50000000-0000-0000-0000-00000000000a', (select day from d), 'd0000000-0000-0000-0000-00000000000a')$$, 5);
select pg_temp.expect_fail('same slot cannot be booked twice',
  $$select public.book_appointment('noor', '50000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000a',
    'b0000000-0000-0000-0000-00000000000a', (select at from slot), 'Other', '0551111111')$$);
select pg_temp.expect_fail('off-grid time is rejected',
  $$select public.book_appointment('noor', '50000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000c',
    'b0000000-0000-0000-0000-00000000000a', (select at + interval '10 minutes' from slot), 'Other', '0551111111')$$);
select pg_temp.expect_fail('outside working hours is rejected',
  $$select public.book_appointment('noor', '50000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000c',
    'b0000000-0000-0000-0000-00000000000a', (select at + interval '5 hours' from slot), 'Other', '0551111111')$$);
select pg_temp.expect_fail('invalid phone is rejected',
  $$select public.book_appointment('noor', '50000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000c',
    'b0000000-0000-0000-0000-00000000000a', (select at from slot), 'Other', '12345')$$);
select pg_temp.expect_fail('draft clinic cannot take bookings',
  $$select public.book_appointment('smile', '50000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000b',
    'b0000000-0000-0000-0000-00000000000b', (select at from slot), 'Other', '0551111111')$$);
select public.book_appointment('noor', '50000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000c',
  'b0000000-0000-0000-0000-00000000000a', (select at from slot), 'Khalid', '+966530689203') is not null;
select public.book_appointment('noor', '50000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000c',
  'b0000000-0000-0000-0000-00000000000a', (select at + interval '30 minutes' from slot), 'Khalid', '0530689203') is not null;
select pg_temp.expect_fail('4th open website booking per phone is refused',
  $$select public.book_appointment('noor', '50000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000c',
    'b0000000-0000-0000-0000-00000000000a', (select at + interval '1 hour' from slot), 'Khalid', '0530689203')$$);
select pg_temp.expect_fail('anon still cannot read the patient it created', 'select count(*) from public.patients');

-- Direct overlap is blocked by the database even outside the booking function.
reset role;
select pg_temp.expect_fail('exclusion constraint blocks double-booking',
  $$insert into public.appointments (clinic_id, branch_id, doctor_id, service_id, patient_id, starts_at, ends_at)
    select clinic_id, branch_id, doctor_id, service_id, patient_id, starts_at + interval '15 minutes', ends_at + interval '15 minutes'
    from public.appointments where doctor_id = 'd0000000-0000-0000-0000-00000000000a' limit 1$$);

-- ─── Time off ───────────────────────────────────────────────────────────────
select pg_temp.act_as('owner@noor.sa');
insert into public.time_off (clinic_id, doctor_id, starts_at, ends_at)
select 'c0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000a', at + interval '1 hour', at + interval '2 hours' from slot;
select pg_temp.expect_eq('time off removes 11:00 and 11:30',
  $$select count(*) from public.available_slots('noor', '50000000-0000-0000-0000-00000000000a', (select day from d), 'd0000000-0000-0000-0000-00000000000a')$$, 3);

-- ─── Roles inside the clinic ────────────────────────────────────────────────
insert into public.patient_clinical (patient_id, clinic_id, medical_history, allergies)
select id, clinic_id, 'Hypertension', 'Penicillin' from public.patients where phone = '+966530689203';

select pg_temp.act_as('reception@noor.sa');
select pg_temp.expect_eq('reception sees clinic patients', 'select count(*) from public.patients', 1);
select pg_temp.expect_eq('reception sees all appointments', 'select count(*) from public.appointments', 3);
select pg_temp.expect_eq('reception cannot read clinical notes', 'select count(*) from public.patient_clinical', 0);
select pg_temp.expect_fail('reception cannot write clinical notes',
  $$insert into public.patient_clinical (patient_id, clinic_id, allergies)
    select id, clinic_id, 'x' from public.patients limit 1$$);
select pg_temp.expect_eq('reception can confirm an appointment',
  $$with u as (update public.appointments set status = 'confirmed'
     where doctor_id = 'd0000000-0000-0000-0000-00000000000a' returning 1) select count(*) from u$$, 1);
select pg_temp.expect_fail('reception cannot change services',
  $$update public.services set price = 1$$);
select pg_temp.expect_fail('reception cannot delete patients',
  $$delete from public.patients$$);

select pg_temp.act_as('drsara@noor.sa');
select pg_temp.expect_eq('doctor sees only own appointments', 'select count(*) from public.appointments', 1);
select pg_temp.expect_eq('doctor sees own patient', 'select count(*) from public.patients', 1);
select pg_temp.expect_eq('treating doctor reads clinical notes', 'select count(*) from public.patient_clinical', 1);
select pg_temp.expect_eq('doctor can complete own appointment',
  $$with u as (update public.appointments set status = 'completed', notes = 'done' returning 1) select count(*) from u$$, 1);
select pg_temp.expect_fail('doctor cannot move own appointment',
  $$update public.appointments set starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day'$$);
select pg_temp.expect_fail('doctor cannot change patient details',
  $$update public.patients set full_name = 'Changed'$$);

select pg_temp.act_as('drali@noor.sa');
select pg_temp.expect_eq('other doctor sees only his appointments', 'select count(*) from public.appointments', 2);

-- Owner of Noor cannot see Smile's patient; Smile's owner cannot see Noor's.
select pg_temp.act_as('owner@noor.sa');
select pg_temp.expect_eq('owner1 sees only own patients', 'select count(*) from public.patients', 1);
select pg_temp.act_as('owner@smile.sa');
select pg_temp.expect_eq('owner2 sees only own patients', 'select count(*) from public.patients', 1);
select pg_temp.expect_eq('owner2 sees none of clinic 1 appointments', 'select count(*) from public.appointments', 0);
select pg_temp.expect_eq('owner2 sees no clinical notes of clinic 1', 'select count(*) from public.patient_clinical', 0);

-- Audit trail records appointment changes for the right clinic only.
select pg_temp.act_as('owner@noor.sa');
select pg_temp.expect_eq('appointment changes are audited',
  $$select (count(*) > 0)::int from public.audit_log where action like 'appointments.%'$$, 1);
select pg_temp.act_as('owner@smile.sa');
select pg_temp.expect_eq('owner2 sees none of clinic 1 audit', $$select count(*) from public.audit_log where action like 'appointments.%'$$, 0);

reset role;
select 'ALL CLINIC-DATA TESTS PASSED' as result;

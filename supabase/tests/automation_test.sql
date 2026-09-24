-- Automation: API-key isolation, patient ownership checks, reminders, self-service links.
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
  if n = 0 and p_sql ~* '^\s*(update|delete)' then raise notice 'ok (0 rows): %', p_label; return; end if;
  raise exception 'SECURITY FAIL: % — statement succeeded: %', p_label, p_sql;
exception
  when raise_exception then
    if sqlerrm like 'SECURITY FAIL%' then raise; end if;
    raise notice 'ok (blocked): % [%]', p_label, sqlerrm;
  when others then raise notice 'ok (blocked): % [%]', p_label, sqlerrm;
end $$;

create or replace function pg_temp.expect_eq(p_label text, p_sql text, p_expected text) returns void language plpgsql as $$
declare got text;
begin
  execute p_sql into got;
  if got is distinct from p_expected then raise exception 'FAIL: % — expected %, got %', p_label, p_expected, got; end if;
  raise notice 'ok: % = %', p_label, got;
end $$;

grant execute on all functions in schema pg_temp to anon, authenticated;

-- ─── Fixtures ───────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@a.sa'),
  ('00000000-0000-0000-0000-0000000000a2', 'reception@a.sa'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner@b.sa');
insert into public.clinics (id, name, city, clinic_type, status, platform) values
  ('c000000a-0000-0000-0000-000000000000', 'Clinic A', 'Jeddah', 'general', 'active', 'smart_clinic'),
  ('c000000b-0000-0000-0000-000000000000', 'Clinic B', 'Riyadh', 'general', 'active', 'smart_clinic');
insert into public.clinic_members values
  ('c000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', 'owner', now()),
  ('c000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'reception', now()),
  ('c000000b-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'owner', now());
update public.clinic_sites set slug = 'clinic-a', published = true, slot_minutes = 30, min_notice_minutes = 0
  where clinic_id = 'c000000a-0000-0000-0000-000000000000';
update public.clinic_sites set slug = 'clinic-b', published = true, slot_minutes = 30, min_notice_minutes = 0
  where clinic_id = 'c000000b-0000-0000-0000-000000000000';

-- Each clinic: one branch, one 30-minute service, one doctor working 09:00–12:00 in 3 days.
create temp table d as select ((now() at time zone 'Asia/Riyadh')::date + 3) as day;
grant select on d to anon, authenticated;
insert into public.branches (id, clinic_id, name) values
  ('b000000a-0000-0000-0000-000000000000', 'c000000a-0000-0000-0000-000000000000', 'A main'),
  ('b000000b-0000-0000-0000-000000000000', 'c000000b-0000-0000-0000-000000000000', 'B main');
insert into public.services (id, clinic_id, name, duration_minutes) values
  ('5000000a-0000-0000-0000-000000000000', 'c000000a-0000-0000-0000-000000000000', 'Cleaning A', 30),
  ('5000000b-0000-0000-0000-000000000000', 'c000000b-0000-0000-0000-000000000000', 'Cleaning B', 30);
insert into public.doctors (id, clinic_id, full_name) values
  ('d000000a-0000-0000-0000-000000000000', 'c000000a-0000-0000-0000-000000000000', 'Dr A'),
  ('d000000b-0000-0000-0000-000000000000', 'c000000b-0000-0000-0000-000000000000', 'Dr B');
insert into public.doctor_services values
  ('c000000a-0000-0000-0000-000000000000', 'd000000a-0000-0000-0000-000000000000', '5000000a-0000-0000-0000-000000000000'),
  ('c000000b-0000-0000-0000-000000000000', 'd000000b-0000-0000-0000-000000000000', '5000000b-0000-0000-0000-000000000000');
insert into public.working_hours (clinic_id, doctor_id, branch_id, weekday, start_time, end_time)
select c, doc, br, extract(dow from (select day from d)), '09:00', '12:00'
from (values ('c000000a-0000-0000-0000-000000000000'::uuid, 'd000000a-0000-0000-0000-000000000000'::uuid, 'b000000a-0000-0000-0000-000000000000'::uuid),
             ('c000000b-0000-0000-0000-000000000000', 'd000000b-0000-0000-0000-000000000000', 'b000000b-0000-0000-0000-000000000000')) v(c, doc, br);

insert into public.clinic_api_keys (clinic_id, name, prefix, key_hash, revoked_at) values
  ('c000000a-0000-0000-0000-000000000000', 'n8n', 'ck_A', public.sha256_hex('ck_A_secret'), null),
  ('c000000a-0000-0000-0000-000000000000', 'old', 'ck_O', public.sha256_hex('ck_A_old'), now()),
  ('c000000b-0000-0000-0000-000000000000', 'n8n', 'ck_B', public.sha256_hex('ck_B_secret'), null);

create temp table k as select public.sha256_hex('ck_A_secret') a, public.sha256_hex('ck_B_secret') b, public.sha256_hex('ck_A_old') old;
create temp table at as select (((select day from d) + time '10:00') at time zone 'Asia/Riyadh') t10;
create temp table saved (name text primary key, val text);
grant select on k, at to anon, authenticated;
grant all on saved to anon, authenticated;

-- ─── API keys ───────────────────────────────────────────────────────────────
select pg_temp.act_as(null);
select pg_temp.expect_fail('unknown key rejected', $$select public.api_clinic_info('nope')$$);
select pg_temp.expect_fail('revoked key rejected', $$select public.api_clinic_info((select old from k))$$);
select pg_temp.expect_eq('key A resolves to clinic A', $$select public.api_clinic_info((select a from k)) #>> '{clinic,name}'$$, 'Clinic A');
select pg_temp.expect_eq('clinic info lists only its services', $$select jsonb_array_length(public.api_clinic_info((select a from k)) -> 'services')::text$$, '1');
select pg_temp.expect_eq('doctor hours exposed for the agent', $$select jsonb_array_length(public.api_clinic_info((select a from k)) #> '{doctors,0,hours}')::text$$, '1');
select pg_temp.expect_fail('internal slot function not callable', $$select * from public.clinic_slots('c000000a-0000-0000-0000-000000000000', '5000000a-0000-0000-0000-000000000000', (select day from d))$$);
select pg_temp.expect_fail('internal booking core not callable',
  $$select public.book_core('c000000a-0000-0000-0000-000000000000', null, null, null, now(), 'x', '0550000000', null, 'website')$$);
select pg_temp.expect_fail('anon cannot read API keys', 'select count(*) from public.clinic_api_keys');

select pg_temp.expect_eq('slots via key A', $$select count(*)::text from public.api_slots((select a from k), '5000000a-0000-0000-0000-000000000000', (select day from d))$$, '6');
select pg_temp.expect_eq('key A cannot see clinic B service slots', $$select count(*)::text from public.api_slots((select a from k), '5000000b-0000-0000-0000-000000000000', (select day from d))$$, '0');

insert into saved select 'booking', public.api_book((select a from k), '5000000a-0000-0000-0000-000000000000', 'd000000a-0000-0000-0000-000000000000',
  'b000000a-0000-0000-0000-000000000000', (select t10 from at), 'Ali Agent', '0551230000', 'ai_agent')::text;
select pg_temp.expect_eq('agent booking returns a 64-char link token', $$select length((select val from saved where name = 'booking')::jsonb ->> 'manage_token')::text$$, '64');
select pg_temp.expect_fail('key B cannot book clinic A doctor',
  $$select public.api_book((select b from k), '5000000a-0000-0000-0000-000000000000', 'd000000a-0000-0000-0000-000000000000',
    'b000000a-0000-0000-0000-000000000000', (select t10 + interval '1 hour' from at), 'Spy', '0559999999')$$);
select pg_temp.expect_fail('API cannot pretend to be the website',
  $$select public.api_book((select a from k), '5000000a-0000-0000-0000-000000000000', 'd000000a-0000-0000-0000-000000000000',
    'b000000a-0000-0000-0000-000000000000', (select t10 + interval '1 hour' from at), 'X', '0559999999', 'website')$$);

create temp table appt as select ((select val from saved where name = 'booking')::jsonb ->> 'id')::uuid id;
grant select on appt to anon, authenticated;
select pg_temp.expect_eq('find by phone (any format)', $$select jsonb_array_length(public.api_find_appointments((select a from k), '+966 55 123 0000'))::text$$, '1');
select pg_temp.expect_eq('key B finds nothing for that phone', $$select jsonb_array_length(public.api_find_appointments((select b from k), '0551230000'))::text$$, '0');
select pg_temp.expect_fail('cancel with the wrong phone', $$select public.api_cancel((select a from k), (select id from appt), '0550000000')$$);
select pg_temp.expect_fail('cancel with another clinic key', $$select public.api_cancel((select b from k), (select id from appt), '0551230000')$$);

select pg_temp.expect_eq('reschedule to 11:00',
  $$select to_char((public.api_reschedule((select a from k), (select id from appt), '0551230000', (select t10 + interval '1 hour' from at)) ->> 'starts_at')::timestamptz at time zone 'Asia/Riyadh', 'HH24:MI')$$, '11:00');
select pg_temp.expect_eq('10:00 is free again, 11:00 taken', $$select string_agg(to_char(starts_at at time zone 'Asia/Riyadh', 'HH24:MI'), ',' order by starts_at)
  from public.api_slots((select a from k), '5000000a-0000-0000-0000-000000000000', (select day from d))$$, '09:00,09:30,10:00,10:30,11:30');

-- ─── Reminders ──────────────────────────────────────────────────────────────
select pg_temp.expect_eq('no reminders while disabled', $$select jsonb_array_length(public.api_due_reminders((select a from k)))::text$$, '0');
-- Enable reminders 72h ahead and move the appointment to 2 days from now.
reset role;
update public.clinic_sites set reminders_enabled = true, reminder_hours_before = 72 where clinic_id = 'c000000a-0000-0000-0000-000000000000';
update public.appointments set starts_at = now() + interval '2 days', ends_at = now() + interval '2 days 30 minutes' where id = (select id from appt);
select pg_temp.act_as(null);
insert into saved select 'reminders', public.api_due_reminders((select a from k))::text;
select pg_temp.expect_eq('one reminder due', $$select jsonb_array_length((select val from saved where name = 'reminders')::jsonb)::text$$, '1');
select pg_temp.expect_eq('reminder carries patient phone', $$select (select val from saved where name = 'reminders')::jsonb #>> '{0,patient_phone}'$$, '+966551230000');
select pg_temp.expect_fail('key B cannot mark clinic A reminder', $$select public.api_mark_reminded((select b from k), (select id from appt))$$);
select public.api_mark_reminded((select a from k), (select id from appt));
select pg_temp.expect_eq('reminder not sent twice', $$select jsonb_array_length(public.api_due_reminders((select a from k)))::text$$, '0');
select pg_temp.expect_eq('key B sees no reminders of A', $$select jsonb_array_length(public.api_due_reminders((select b from k)))::text$$, '0');

-- ─── Self-service link ──────────────────────────────────────────────────────
create temp table tok as select
  public.sha256_hex((select val from saved where name = 'reminders')::jsonb #>> '{0,manage_token}') latest,
  public.sha256_hex((select val from saved where name = 'booking')::jsonb ->> 'manage_token') first;
grant select on tok to anon;
select pg_temp.expect_eq('link opens the appointment', $$select public.manage_appointment((select latest from tok)) ->> 'patient_name'$$, 'Ali Agent');
select pg_temp.expect_eq('older link is replaced', $$select coalesce(public.manage_appointment((select first from tok)) ->> 'id', 'none')$$, 'none');
select pg_temp.expect_fail('garbage link rejected', $$select public.manage_confirm('nope')$$);
select pg_temp.expect_eq('patient confirms', $$select public.manage_confirm((select latest from tok)) ->> 'status'$$, 'confirmed');
reset role;
update public.clinic_sites set reschedule_cutoff_hours = 72 where clinic_id = 'c000000a-0000-0000-0000-000000000000';
select pg_temp.act_as(null);
select pg_temp.expect_eq('inside the cutoff: cannot change', $$select public.manage_appointment((select latest from tok)) ->> 'can_change'$$, 'false');
select pg_temp.expect_fail('cancel refused inside the cutoff', $$select public.manage_cancel((select latest from tok))$$);
reset role;
update public.clinic_sites set reschedule_cutoff_hours = 1 where clinic_id = 'c000000a-0000-0000-0000-000000000000';
update public.appointments set starts_at = (select t10 from at), ends_at = (select t10 + interval '30 minutes' from at) where id = (select id from appt);
select pg_temp.act_as(null);
select pg_temp.expect_eq('self-service slots include own time', $$select count(*)::text from public.manage_slots((select latest from tok), (select day from d))$$, '6');
select pg_temp.expect_eq('patient reschedules to 09:00',
  $$select to_char((public.manage_reschedule((select latest from tok), (select t10 - interval '1 hour' from at), null) ->> 'starts_at')::timestamptz at time zone 'Asia/Riyadh', 'HH24:MI')$$, '09:00');
select pg_temp.expect_eq('patient cancels', $$select public.manage_cancel((select latest from tok)) ->> 'status'$$, 'cancelled');

-- ─── Dashboard: API keys are per clinic ─────────────────────────────────────
select pg_temp.act_as('owner@a.sa');
insert into public.clinic_api_keys (clinic_id, name, prefix, key_hash, created_by)
values ('c000000a-0000-0000-0000-000000000000', 'agent', 'ck_N', public.sha256_hex('ck_new'), auth.uid());
select pg_temp.expect_eq('owner A sees only A keys', 'select count(*)::text from public.clinic_api_keys', '3');
select pg_temp.expect_fail('owner A cannot create a key for B',
  $$insert into public.clinic_api_keys (clinic_id, name, prefix, key_hash, created_by)
    values ('c000000b-0000-0000-0000-000000000000', 'x', 'ck_X', 'x', auth.uid())$$);
select pg_temp.expect_fail('owner cannot rewrite a key hash', $$update public.clinic_api_keys set key_hash = 'y'$$);
select pg_temp.expect_eq('owner can revoke', $$with u as (update public.clinic_api_keys set revoked_at = now() where name = 'agent' returning 1) select count(*)::text from u$$, '1');
select pg_temp.expect_eq('audit never stores key hashes', $$select count(*)::text from public.audit_log where details::text like '%' || public.sha256_hex('ck_new') || '%'$$, '0');
select pg_temp.act_as('reception@a.sa');
select pg_temp.expect_eq('reception sees no API keys', 'select count(*)::text from public.clinic_api_keys', '0');

-- ─── Automatic occasion themes ──────────────────────────────────────────────
reset role;
update public.clinic_sites set auto_occasions = true where clinic_id = 'c000000a-0000-0000-0000-000000000000';
select pg_temp.expect_eq('auto occasion follows the calendar', $$select public.public_site('clinic-a') #>> '{site,template}'$$,
  (select case when to_char(now() at time zone 'Asia/Riyadh', 'MM-DD') between '02-20' and '02-25' then 'founding_day'
               when to_char(now() at time zone 'Asia/Riyadh', 'MM-DD') between '09-20' and '09-26' then 'national_day'
               else 'modern' end));
select pg_temp.expect_eq('clinics without auto keep their template', $$select public.public_site('clinic-b') #>> '{site,template}'$$, 'modern');

select 'ALL AUTOMATION TESTS PASSED' as result;

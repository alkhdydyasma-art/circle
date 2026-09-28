-- WhatsApp agent: clinic routing, idempotency, phone-scoped actions, hand-off, inbox RLS.
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
insert into public.clinics (id, name, city, clinic_type, status) values
  ('c000000a-0000-0000-0000-000000000000', 'Clinic A', 'Jeddah', 'general', 'active'),
  ('c000000b-0000-0000-0000-000000000000', 'Clinic B', 'Riyadh', 'general', 'active');
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


insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a3', 'doctor@a.sa');
insert into public.clinic_members values ('c000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3', 'doctor', now());
update public.clinic_sites set whatsapp_phone_number_id = '111111', ai_agent_enabled = true where clinic_id = 'c000000a-0000-0000-0000-000000000000';
update public.clinic_sites set whatsapp_phone_number_id = '222222' where clinic_id = 'c000000b-0000-0000-0000-000000000000';
insert into public.clinic_knowledge (clinic_id, title, content) values
  ('c000000a-0000-0000-0000-000000000000', 'Parking', 'Free parking behind the clinic.'),
  ('c000000b-0000-0000-0000-000000000000', 'Secret B', 'Only clinic B knows this.');

-- ─── Inbound routing & idempotency ──────────────────────────────────────────
reset role;
select pg_temp.expect_eq('inbound routes to clinic A',
  $$select public.agent_inbound('111111', '966551111111', 'Sara', 'wamid.1', 'Hi') ->> 'clinic_id'$$, 'c000000a-0000-0000-0000-000000000000');
select pg_temp.expect_eq('duplicate delivery ignored',
  $$select coalesce(public.agent_inbound('111111', '966551111111', 'Sara', 'wamid.1', 'Hi')::text, 'null')$$, 'null');
select pg_temp.expect_eq('one message stored', $$select count(*)::text from public.conversation_messages$$, '1');
select pg_temp.expect_eq('clinic B number routes to B',
  $$select public.agent_inbound('222222', '0552222222', null, 'wamid.2', 'Hello B') ->> 'clinic_id'$$, 'c000000b-0000-0000-0000-000000000000');
select pg_temp.expect_fail('unknown number rejected', $$select public.agent_inbound('999999', '0551111111', null, 'wamid.3', 'x')$$);
select pg_temp.expect_fail('non-Saudi sender rejected', $$select public.agent_inbound('111111', '14155550000', null, 'wamid.4', 'x')$$);

-- ─── Context (retrieval) is per clinic ──────────────────────────────────────
select pg_temp.expect_eq('A context has A knowledge only',
  $$select string_agg(k ->> 'title', ',') from jsonb_array_elements(public.agent_context('c000000a-0000-0000-0000-000000000000') -> 'knowledge') k$$, 'Parking');

-- ─── Phone-scoped actions ───────────────────────────────────────────────────
create temp table s as
  select * from public.agent_slots('c000000a-0000-0000-0000-000000000000', '+966551111111', '5000000a-0000-0000-0000-000000000000', (select day from d), 1) limit 2;
select pg_temp.expect_eq('slots found', $$select count(*)::text from s$$, '2');
create temp table booked as
  select public.agent_book('c000000a-0000-0000-0000-000000000000', '0551111111', 'Sara Test', '5000000a-0000-0000-0000-000000000000',
    'd000000a-0000-0000-0000-000000000000', 'b000000a-0000-0000-0000-000000000000', (select min(starts_at) from s)) as j;
select pg_temp.expect_eq('booked via agent source',
  $$select source from public.appointments where id = (select (j ->> 'id')::uuid from booked)$$, 'ai_agent');
select pg_temp.expect_eq('owner phone sees it',
  $$select jsonb_array_length(public.agent_find_appointments('c000000a-0000-0000-0000-000000000000', '+966551111111'))::text$$, '1');
select pg_temp.expect_eq('another phone sees nothing',
  $$select jsonb_array_length(public.agent_find_appointments('c000000a-0000-0000-0000-000000000000', '+966559999999'))::text$$, '0');
select pg_temp.expect_eq('same phone in clinic B sees nothing',
  $$select jsonb_array_length(public.agent_find_appointments('c000000b-0000-0000-0000-000000000000', '+966551111111'))::text$$, '0');
select pg_temp.expect_fail('other phone cannot cancel',
  $$select public.agent_cancel('c000000a-0000-0000-0000-000000000000', '+966559999999', (select (j ->> 'id')::uuid from booked))$$);
select pg_temp.expect_fail('other clinic cannot cancel',
  $$select public.agent_cancel('c000000b-0000-0000-0000-000000000000', '+966551111111', (select (j ->> 'id')::uuid from booked))$$);
select pg_temp.expect_fail('other phone cannot search reschedule slots',
  $$select * from public.agent_slots('c000000a-0000-0000-0000-000000000000', '+966559999999', null, (select day from d), 1, null, null, (select (j ->> 'id')::uuid from booked))$$);
select pg_temp.expect_eq('reschedule to next slot',
  $$select (public.agent_reschedule('c000000a-0000-0000-0000-000000000000', '+966551111111', (select (j ->> 'id')::uuid from booked),
     (select max(starts_at) from s)) ->> 'starts_at')::timestamptz = (select max(starts_at) from s)$$, 'true');
select pg_temp.expect_eq('confirm',
  $$select public.agent_confirm('c000000a-0000-0000-0000-000000000000', '+966551111111', (select (j ->> 'id')::uuid from booked)) ->> 'status'$$, 'confirmed');
select pg_temp.expect_eq('cancel',
  $$select public.agent_cancel('c000000a-0000-0000-0000-000000000000', '+966551111111', (select (j ->> 'id')::uuid from booked)) ->> 'status'$$, 'cancelled');

-- ─── Hand-off ───────────────────────────────────────────────────────────────
select public.agent_handoff((select id from public.conversations where patient_phone = '+966551111111'), 'wants a human');
select pg_temp.expect_eq('handed off',
  $$select status || '/' || needs_attention from public.conversations where patient_phone = '+966551111111'$$, 'human/true');

select pg_temp.expect_eq('message while handed off needs attention',
  $$select (public.agent_inbound('111111', '0551111111', null, 'wamid.5', 'still there?') ->> 'status') || '/' ||
     (select needs_attention from public.conversations where patient_phone = '+966551111111')$$, 'human/true');
select pg_temp.expect_eq('assistant off → needs attention',
  $$select needs_attention::text from public.conversations where patient_phone = '+966552222222'$$, 'true');

-- ─── Inbox access (RLS) ─────────────────────────────────────────────────────
select pg_temp.act_as('reception@a.sa');
select pg_temp.expect_eq('reception sees A conversations only', $$select count(*)::text from public.conversations$$, '1');
select pg_temp.expect_eq('reception reads A messages', $$select count(*)::text from public.conversation_messages$$, '2');
select pg_temp.expect_eq('reception can release to AI',
  $$with u as (update public.conversations set status = 'ai' returning 1) select count(*)::text from u$$, '1');
select pg_temp.expect_fail('reception cannot forge messages',
  $$insert into public.conversation_messages (conversation_id, clinic_id, role, body) select id, clinic_id, 'agent', 'x' from public.conversations$$);
select pg_temp.expect_fail('reception cannot call agent functions',
  $$select public.agent_find_appointments('c000000a-0000-0000-0000-000000000000', '+966551111111')$$);
select pg_temp.expect_eq('reception reads knowledge', $$select count(*)::text from public.clinic_knowledge$$, '1');
select pg_temp.expect_fail('reception cannot edit knowledge', $$update public.clinic_knowledge set title = 'x'$$);
select pg_temp.act_as('doctor@a.sa');
select pg_temp.expect_eq('doctor sees no conversations', $$select count(*)::text from public.conversations$$, '0');
select pg_temp.act_as('owner@b.sa');
select pg_temp.expect_eq('clinic B owner sees only B', $$select string_agg(patient_phone, ',') from public.conversations$$, '+966552222222');
select pg_temp.expect_eq('clinic B knowledge only', $$select string_agg(title, ',') from public.clinic_knowledge$$, 'Secret B');
select pg_temp.expect_fail('clinic cannot claim a WhatsApp number',
  $$update public.clinic_sites set whatsapp_phone_number_id = '333333'$$);
select pg_temp.expect_eq('clinic can switch its assistant on',
  $$with u as (update public.clinic_sites set ai_agent_enabled = true returning 1) select count(*)::text from u$$, '1');
select pg_temp.act_as(null);
select pg_temp.expect_fail('anon cannot call agent_inbound', $$select public.agent_inbound('111111', '0551111111', null, 'wamid.9', 'x')$$);
select pg_temp.expect_fail('anon cannot read conversations', $$select count(*) from public.conversations$$);

-- ─── Reports ────────────────────────────────────────────────────────────────
select pg_temp.act_as('owner@a.sa');
select pg_temp.expect_eq('owner gets clinic report',
  $$select (public.clinic_report('c000000a-0000-0000-0000-000000000000', now() - interval '30 days', now() + interval '30 days') -> 'totals' ->> 'total')::int > 0$$, 'true');
select pg_temp.expect_eq('report carries no phone numbers',
  $$select public.clinic_report('c000000a-0000-0000-0000-000000000000', now() - interval '30 days', now() + interval '30 days')::text ~ '9665'$$, 'false');
select pg_temp.expect_fail('report period capped',
  $$select public.clinic_report('c000000a-0000-0000-0000-000000000000', now() - interval '3 years', now())$$);
select pg_temp.act_as('reception@a.sa');
select pg_temp.expect_fail('reception cannot read reports',
  $$select public.clinic_report('c000000a-0000-0000-0000-000000000000', now() - interval '7 days', now())$$);
select pg_temp.act_as('doctor@a.sa');
select pg_temp.expect_fail('doctor cannot read reports',
  $$select public.clinic_report('c000000a-0000-0000-0000-000000000000', now() - interval '7 days', now())$$);
select pg_temp.act_as('owner@b.sa');
select pg_temp.expect_fail('other clinic cannot read reports',
  $$select public.clinic_report('c000000a-0000-0000-0000-000000000000', now() - interval '7 days', now())$$);
select pg_temp.expect_fail('report internals not callable',
  $$select public.report_core('c000000a-0000-0000-0000-000000000000', now() - interval '7 days', now())$$);
select pg_temp.act_as(null);
select pg_temp.expect_fail('anon cannot read reports',
  $$select public.clinic_report('c000000a-0000-0000-0000-000000000000', now() - interval '7 days', now())$$);
select pg_temp.expect_fail('api report needs a valid key', $$select public.api_report('nope', 7)$$);

reset role;
do $$ begin raise notice 'ALL AGENT TESTS PASSED'; end $$;

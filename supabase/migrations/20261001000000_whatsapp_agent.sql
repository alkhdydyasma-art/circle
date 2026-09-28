-- WhatsApp AI agent: per-clinic WhatsApp settings, knowledge base (the agent's retrieval
-- source), conversations with human hand-off, and the agent's data functions.
--
-- The agent runs inside the Circle server with the service key. It never gets a general
-- database handle: every function below is scoped to one clinic AND the phone number the
-- patient is writing from, so a prompt-injected agent still can't read or change anyone
-- else's appointments.

-- ─── Settings ───────────────────────────────────────────────────────────────
alter table public.clinic_sites
  -- Meta "phone number id" of the clinic's WhatsApp Business number (routes inbound messages).
  add column if not exists whatsapp_phone_number_id text unique
    check (whatsapp_phone_number_id is null or whatsapp_phone_number_id ~ '^[0-9]{5,30}$'),
  add column if not exists ai_agent_enabled boolean not null default false,
  -- Extra instructions from the clinic (tone, policies). Shown to the model as clinic policy.
  add column if not exists ai_agent_instructions text not null default ''
    check (char_length(ai_agent_instructions) <= 2000);

-- Only Circle staff connect a WhatsApp number: it routes patients' messages, so a clinic
-- must not be able to claim another clinic's number before that clinic saves it.
create or replace function public.guard_whatsapp_number()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.whatsapp_phone_number_id is distinct from old.whatsapp_phone_number_id
     and auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'whatsapp_number_admin_only' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists clinic_sites_guard_whatsapp on public.clinic_sites;
create trigger clinic_sites_guard_whatsapp before update on public.clinic_sites
  for each row execute function public.guard_whatsapp_number();

-- ─── Knowledge base ─────────────────────────────────────────────────────────
create table if not exists public.clinic_knowledge (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  content text not null check (char_length(content) between 2 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clinic_knowledge_clinic_idx on public.clinic_knowledge (clinic_id);
alter table public.clinic_knowledge enable row level security;
revoke all on public.clinic_knowledge from anon;
grant select, insert, update, delete on public.clinic_knowledge to authenticated;

drop policy if exists "knowledge: members read" on public.clinic_knowledge;
create policy "knowledge: members read" on public.clinic_knowledge for select to authenticated
  using (public.is_clinic_member(clinic_id));
drop policy if exists "knowledge: managers write" on public.clinic_knowledge;
create policy "knowledge: managers write" on public.clinic_knowledge for all to authenticated
  using (public.can_manage_clinic(clinic_id)) with check (public.can_manage_clinic(clinic_id));

-- At most 40 entries per clinic keeps the whole base inside one cached prompt.
create or replace function public.guard_knowledge_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.clinic_knowledge where clinic_id = new.clinic_id) >= 40 then
    raise exception 'knowledge_limit' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists clinic_knowledge_limit on public.clinic_knowledge;
create trigger clinic_knowledge_limit before insert on public.clinic_knowledge
  for each row execute function public.guard_knowledge_count();
drop trigger if exists clinic_knowledge_guard_clinic on public.clinic_knowledge;
create trigger clinic_knowledge_guard_clinic before update on public.clinic_knowledge
  for each row execute function public.guard_clinic_id();
drop trigger if exists clinic_knowledge_touch on public.clinic_knowledge;
create trigger clinic_knowledge_touch before update on public.clinic_knowledge
  for each row execute function public.touch_updated_at();

-- ─── Conversations ──────────────────────────────────────────────────────────
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  patient_phone text not null check (patient_phone ~ '^\+9665[0-9]{8}$'),
  patient_name text check (char_length(patient_name) <= 120),
  -- ai: the agent answers · human: staff took over (agent silent) · closed: resolved
  status text not null default 'ai' check (status in ('ai', 'human', 'closed')),
  needs_attention boolean not null default false,
  handoff_reason text check (char_length(handoff_reason) <= 300),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (clinic_id, patient_phone)
);
create index if not exists conversations_recent_idx on public.conversations (clinic_id, last_message_at desc);

create table if not exists public.conversation_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  role text not null check (role in ('patient', 'agent', 'staff')),
  body text not null check (char_length(body) between 1 and 4096),
  -- WhatsApp message id of inbound messages: Meta retries webhooks, this makes them idempotent.
  wa_message_id text unique,
  created_at timestamptz not null default now()
);
create index if not exists conversation_messages_conv_idx on public.conversation_messages (conversation_id, id);

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
revoke all on public.conversations, public.conversation_messages from anon;

-- Front desk (owner, manager, reception) handles conversations; doctors don't see them.
drop policy if exists "conversations: front desk" on public.conversations;
create policy "conversations: front desk" on public.conversations for select to authenticated
  using (public.is_front_desk(clinic_id));
drop policy if exists "conversations: front desk update" on public.conversations;
create policy "conversations: front desk update" on public.conversations for update to authenticated
  using (public.is_front_desk(clinic_id)) with check (public.is_front_desk(clinic_id));
drop policy if exists "messages: front desk read" on public.conversation_messages;
create policy "messages: front desk read" on public.conversation_messages for select to authenticated
  using (public.is_front_desk(clinic_id));
-- Staff replies are written by the server after it sends them on WhatsApp.
revoke insert, update, delete on public.conversation_messages from authenticated;
grant select on public.conversation_messages to authenticated;
revoke insert, delete on public.conversations from authenticated;
grant select, update (status, needs_attention) on public.conversations to authenticated;

drop trigger if exists conversations_guard_clinic on public.conversations;
create trigger conversations_guard_clinic before update on public.conversations
  for each row execute function public.guard_clinic_id();

-- ─── Agent functions (service role only) ────────────────────────────────────
-- Records an inbound patient message. Returns null for a duplicate delivery.
create or replace function public.agent_inbound(
  p_phone_number_id text, p_from text, p_name text, p_wa_message_id text, p_body text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_clinic uuid;
  v_enabled boolean;
  v_phone text := public.normalize_sa_mobile(p_from);
  v_conv public.conversations;
begin
  select s.clinic_id, s.ai_agent_enabled into v_clinic, v_enabled
  from public.clinic_sites s join public.clinics c on c.id = s.clinic_id
  where s.whatsapp_phone_number_id = p_phone_number_id and c.status = 'active';
  if v_clinic is null then raise exception 'unknown_number' using errcode = 'P0002'; end if;
  if v_phone is null then raise exception 'invalid_phone' using errcode = '22023'; end if;
  if exists (select 1 from public.conversation_messages where wa_message_id = p_wa_message_id) then
    return null;
  end if;

  -- A person must answer when the assistant is off or staff already took the chat over.
  insert into public.conversations as cv (clinic_id, patient_phone, patient_name, needs_attention)
  values (v_clinic, v_phone, nullif(left(btrim(p_name), 120), ''), not v_enabled)
  on conflict (clinic_id, patient_phone) do update
    set patient_name = coalesce(cv.patient_name, excluded.patient_name),
        status = case when cv.status = 'closed' then 'ai' else cv.status end,
        needs_attention = cv.needs_attention or not v_enabled or cv.status = 'human',
        last_message_at = now()
  returning * into v_conv;

  insert into public.conversation_messages (conversation_id, clinic_id, role, body, wa_message_id)
  values (v_conv.id, v_clinic, 'patient', left(p_body, 4096), p_wa_message_id);

  -- Messages are kept 90 days (PDPL data minimisation); clean up opportunistically.
  if random() < 0.02 then
    delete from public.conversation_messages where created_at < now() - interval '90 days';
  end if;

  return jsonb_build_object(
    'clinic_id', v_clinic, 'conversation_id', v_conv.id, 'phone', v_phone,
    'status', v_conv.status, 'ai_enabled', v_enabled
  );
end $$;

-- Everything the agent knows about the clinic: the retrieval step of its answers.
create or replace function public.agent_context(p_clinic uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'clinic', jsonb_build_object('name', c.name, 'city', c.city, 'phone', s.phone, 'whatsapp', s.whatsapp,
      'timezone', s.timezone, 'about', s.content ->> 'about', 'website', s.slug),
    'rules', jsonb_build_object('booking_days_ahead', s.booking_days_ahead, 'min_notice_minutes', s.min_notice_minutes,
      'reschedule_cutoff_hours', s.reschedule_cutoff_hours),
    'instructions', s.ai_agent_instructions,
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', sv.id, 'name', sv.name, 'description', sv.description,
        'duration_minutes', sv.duration_minutes, 'price', sv.price) order by sv.sort)
      from public.services sv where sv.clinic_id = c.id and sv.is_active), '[]'),
    'doctors', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.full_name, 'title', d.title,
        'specialty', d.specialty,
        'service_ids', coalesce((select jsonb_agg(ds.service_id) from public.doctor_services ds where ds.doctor_id = d.id), '[]'),
        'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', w.weekday, 'branch_id', w.branch_id,
            'start', to_char(w.start_time, 'HH24:MI'), 'end', to_char(w.end_time, 'HH24:MI')) order by w.weekday, w.start_time)
          from public.working_hours w where w.doctor_id = d.id), '[]')) order by d.sort)
      from public.doctors d where d.clinic_id = c.id and d.is_active), '[]'),
    'branches', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'address', b.address, 'maps_url', b.maps_url))
      from public.branches b where b.clinic_id = c.id and b.is_active), '[]'),
    'knowledge', coalesce((select jsonb_agg(jsonb_build_object('title', k.title, 'content', k.content) order by k.created_at)
      from public.clinic_knowledge k where k.clinic_id = c.id), '[]')
  )
  from public.clinics c join public.clinic_sites s on s.clinic_id = c.id
  where c.id = p_clinic;
$$;

create or replace function public.agent_history(p_conversation uuid, p_limit int default 20)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('role', m.role, 'body', m.body, 'at', m.created_at) order by m.id), '[]')
  from (select * from public.conversation_messages where conversation_id = p_conversation
        order by id desc limit least(p_limit, 50)) m;
$$;

create or replace function public.agent_reply(p_conversation uuid, p_body text)
returns void language sql security definer set search_path = '' as $$
  insert into public.conversation_messages (conversation_id, clinic_id, role, body)
  select id, clinic_id, 'agent', left(p_body, 4096) from public.conversations where id = p_conversation;
  update public.conversations set last_message_at = now() where id = p_conversation;
$$;

create or replace function public.agent_handoff(p_conversation uuid, p_reason text)
returns void language sql security definer set search_path = '' as $$
  update public.conversations
  set status = 'human', needs_attention = true, handoff_reason = left(p_reason, 300)
  where id = p_conversation;
$$;

-- The patient's own upcoming appointments.
create or replace function public.agent_find_appointments(p_clinic uuid, p_phone text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.appointment_view(a.id) order by a.starts_at), '[]')
  from public.appointments a join public.patients p on p.id = a.patient_id
  where a.clinic_id = p_clinic and p.phone = public.normalize_sa_mobile(p_phone)
    and a.status in ('pending', 'confirmed') and a.starts_at > now();
$$;

create or replace function public.agent_owned(p_clinic uuid, p_phone text, p_appt uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.appointments a join public.patients p on p.id = a.patient_id
    where a.id = p_appt and a.clinic_id = p_clinic and p.phone = public.normalize_sa_mobile(p_phone)
  ) then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;
  return p_appt;
end $$;

-- Open times over a few days. For a reschedule, pass the appointment: its service is used
-- and its own current slot doesn't block the search.
create or replace function public.agent_slots(
  p_clinic uuid, p_phone text, p_service uuid, p_from date, p_days int default 3,
  p_doctor uuid default null, p_branch uuid default null, p_appt uuid default null
) returns table (doctor_id uuid, branch_id uuid, starts_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_service uuid := p_service;
begin
  if p_appt is not null then
    perform public.agent_owned(p_clinic, p_phone, p_appt);
    select a.service_id into v_service from public.appointments a where a.id = p_appt;
  end if;
  return query
    select s.doctor_id, s.branch_id, s.starts_at
    from generate_series(p_from, p_from + least(greatest(p_days, 1), 7) - 1, interval '1 day') d,
         lateral public.clinic_slots(p_clinic, v_service, d::date, p_doctor, p_branch, p_appt) s
    order by s.starts_at
    limit 60;
end $$;

create or replace function public.agent_book(
  p_clinic uuid, p_phone text, p_full_name text, p_service uuid, p_doctor uuid, p_branch uuid,
  p_starts_at timestamptz, p_notes text default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  return public.book_core(p_clinic, p_service, p_doctor, p_branch, p_starts_at, p_full_name, p_phone, p_notes, 'ai_agent');
end $$;

create or replace function public.agent_reschedule(
  p_clinic uuid, p_phone text, p_appt uuid, p_starts_at timestamptz, p_doctor uuid default null, p_branch uuid default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.reschedule_core(public.agent_owned(p_clinic, p_phone, p_appt), p_starts_at, p_doctor, p_branch);
  return public.appointment_view(p_appt);
end $$;

create or replace function public.agent_cancel(p_clinic uuid, p_phone text, p_appt uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.agent_owned(p_clinic, p_phone, p_appt);
  update public.appointments set status = 'cancelled' where id = p_appt and status in ('pending', 'confirmed');
  if not found then raise exception 'too_late_to_change' using errcode = 'P0001'; end if;
  return public.appointment_view(p_appt);
end $$;

create or replace function public.agent_confirm(p_clinic uuid, p_phone text, p_appt uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.agent_owned(p_clinic, p_phone, p_appt);
  update public.appointments set status = 'confirmed' where id = p_appt and status = 'pending';
  return public.appointment_view(p_appt);
end $$;

-- Staff reply sent from the dashboard (the server sends it on WhatsApp first).
create or replace function public.staff_reply(p_conversation uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.conversation_messages (conversation_id, clinic_id, role, body)
  select id, clinic_id, 'staff', left(p_body, 4096) from public.conversations where id = p_conversation;
  update public.conversations set last_message_at = now(), needs_attention = false where id = p_conversation;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.agent_inbound(text, text, text, text, text)', 'public.agent_context(uuid)',
    'public.agent_history(uuid, int)', 'public.agent_reply(uuid, text)', 'public.agent_handoff(uuid, text)',
    'public.agent_find_appointments(uuid, text)', 'public.agent_owned(uuid, text, uuid)',
    'public.agent_slots(uuid, text, uuid, date, int, uuid, uuid, uuid)',
    'public.agent_book(uuid, text, text, uuid, uuid, uuid, timestamptz, text)',
    'public.agent_reschedule(uuid, text, uuid, timestamptz, uuid, uuid)',
    'public.agent_cancel(uuid, text, uuid)', 'public.agent_confirm(uuid, text, uuid)',
    'public.staff_reply(uuid, text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;

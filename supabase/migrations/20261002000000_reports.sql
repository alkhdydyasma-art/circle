-- Manager reports: one aggregate per period (visits by status, source, doctor, service and
-- day, no-show and cancellation rates, estimated revenue, new patients, WhatsApp activity).
-- Counts only — no patient names or phone numbers — so the weekly n8n report can be sent
-- to the owner without moving patient data around.

-- Role helpers return false (never NULL) for non-members, so `if not helper(...)` in
-- plpgsql can't be bypassed. RLS behaviour is unchanged (NULL already meant "deny" there).
create or replace function public.has_clinic_role(p_clinic uuid, p_roles public.clinic_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or coalesce(public.clinic_role_of(p_clinic) = any (p_roles), false);
$$;
create or replace function public.can_manage_clinic(p_clinic uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin()
      or coalesce(public.clinic_role_of(p_clinic) in ('owner', 'manager'), false);
$$;
create or replace function public.can_assign_role(p_clinic uuid, p_role public.clinic_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin()
      or coalesce(public.clinic_role_of(p_clinic) = 'owner', false)
      or coalesce(public.clinic_role_of(p_clinic) = 'manager' and p_role in ('doctor', 'reception'), false);
$$;

create or replace function public.report_core(p_clinic uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  with s as (select timezone as tz from public.clinic_sites where clinic_id = p_clinic),
  a as (
    select ap.*, sv.name as service, sv.price, d.full_name as doctor
    from public.appointments ap
    join public.services sv on sv.id = ap.service_id
    join public.doctors d on d.id = ap.doctor_id
    where ap.clinic_id = p_clinic and ap.starts_at >= p_from and ap.starts_at < p_to
  ),
  tot as (
    select count(*) as total,
      count(*) filter (where status = 'pending') as pending,
      count(*) filter (where status = 'confirmed') as confirmed,
      count(*) filter (where status = 'completed') as completed,
      count(*) filter (where status = 'cancelled') as cancelled,
      count(*) filter (where status = 'no_show') as no_show,
      coalesce(sum(price) filter (where status = 'completed'), 0) as revenue
    from a
  )
  select jsonb_build_object(
    'clinic', (select name from public.clinics where id = p_clinic),
    'from', p_from, 'to', p_to, 'timezone', (select tz from s),
    'totals', (select to_jsonb(tot) from tot),
    'no_show_rate', (select case when completed + no_show > 0 then round(no_show::numeric / (completed + no_show), 3) end from tot),
    'cancel_rate', (select case when total > 0 then round(cancelled::numeric / total, 3) end from tot),
    'by_source', coalesce((select jsonb_object_agg(source, n) from (select source, count(*) as n from a group by source) x), '{}'),
    'by_doctor', coalesce((select jsonb_agg(x order by x.total desc) from (
      select doctor as name, count(*) as total,
        count(*) filter (where status = 'completed') as completed,
        count(*) filter (where status = 'no_show') as no_show,
        count(*) filter (where status = 'cancelled') as cancelled,
        coalesce(sum(price) filter (where status = 'completed'), 0) as revenue
      from a group by doctor) x), '[]'),
    'by_service', coalesce((select jsonb_agg(x order by x.total desc) from (
      select service as name, count(*) as total,
        coalesce(sum(price) filter (where status = 'completed'), 0) as revenue
      from a group by service) x), '[]'),
    'by_day', coalesce((select jsonb_agg(x order by x.day) from (
      select (starts_at at time zone (select tz from s))::date as day, count(*) as total,
        count(*) filter (where status in ('cancelled', 'no_show')) as missed
      from a group by 1) x), '[]'),
    'new_patients', (select count(*) from public.patients where clinic_id = p_clinic and created_at >= p_from and created_at < p_to),
    'conversations', (select jsonb_build_object(
        'total', count(*),
        'handed_off', count(*) filter (where handoff_reason is not null),
        'waiting', count(*) filter (where needs_attention))
      from public.conversations where clinic_id = p_clinic and last_message_at >= p_from and last_message_at < p_to),
    'upcoming_7d', (select count(*) from public.appointments where clinic_id = p_clinic
        and status in ('pending', 'confirmed') and starts_at >= now() and starts_at < now() + interval '7 days'),
    'unconfirmed_7d', (select count(*) from public.appointments where clinic_id = p_clinic
        and status = 'pending' and starts_at >= now() and starts_at < now() + interval '7 days')
  );
$$;
revoke execute on function public.report_core(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Dashboard: owners, managers and Circle staff only. At most one year per call.
create or replace function public.clinic_report(p_clinic uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage_clinic(p_clinic) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_to <= p_from or p_to - p_from > interval '366 days' then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  return public.report_core(p_clinic, p_from, p_to);
end $$;
revoke execute on function public.clinic_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.clinic_report(uuid, timestamptz, timestamptz) to authenticated;

-- n8n (API key): the last p_days days, ending now. Feeds the automatic weekly report.
create or replace function public.api_report(p_key_hash text, p_days int)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_clinic uuid := public.api_clinic(p_key_hash);
begin
  if p_days is null or p_days not between 1 and 92 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  return public.report_core(v_clinic, now() - make_interval(days => p_days), now());
end $$;
revoke execute on function public.api_report(text, int) from public;
grant execute on function public.api_report(text, int) to anon, authenticated;

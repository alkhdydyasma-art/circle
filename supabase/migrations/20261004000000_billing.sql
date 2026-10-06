-- Subscriptions: 14-day free trial, plans, payments and automatic reminders.
-- Plans (SAR / month): starter = الانطلاقة 799, standard = النمو 1,299 (founders 999),
-- pro = التوسّع (custom price). Yearly = 10 months. Gateway-agnostic: a payment is recorded
-- by Circle staff from the admin page, or by n8n from any gateway's webhook.

alter table public.clinics
  add column if not exists trial_ends_at timestamptz default (now() + interval '14 days'),
  add column if not exists paid_until timestamptz,
  add column if not exists billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  add column if not exists founder boolean not null default false,
  -- Demo / internal clinics never need to pay.
  add column if not exists billing_exempt boolean not null default false;

-- Clinics that existed before billing (the demo clinic) are exempt.
do $$ begin
  if not exists (select 1 from public.clinics where billing_exempt) then
    update public.clinics set billing_exempt = true where paid_until is null and created_at < now() - interval '1 minute';
  end if;
end $$;

-- Commercial fields are Circle staff only (service role and SQL editor allowed: no auth.uid()).
create or replace function public.guard_clinic_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_platform_admin() and (
       new.status is distinct from old.status
    or new.plan is distinct from old.plan
    or new.lead_id is distinct from old.lead_id
    or new.trial_ends_at is distinct from old.trial_ends_at
    or new.paid_until is distinct from old.paid_until
    or new.billing_cycle is distinct from old.billing_cycle
    or new.founder is distinct from old.founder
    or new.billing_exempt is distinct from old.billing_exempt
  ) then
    raise exception 'only Circle staff can change subscription fields' using errcode = '42501';
  end if;
  return new;
end $$;

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  provider text not null check (provider in ('manual', 'tap', 'paytabs', 'moyasar', 'bank_transfer')),
  reference text not null check (char_length(reference) between 1 and 120),
  amount_halalas int not null check (amount_halalas > 0),
  cycle text not null check (cycle in ('monthly', 'yearly')),
  plan text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  recorded_by uuid,
  unique (provider, reference)
);
create index if not exists subscription_payments_clinic_idx on public.subscription_payments (clinic_id, created_at desc);
alter table public.subscription_payments enable row level security;
revoke all on public.subscription_payments from anon, authenticated;
grant select on public.subscription_payments to authenticated;
drop policy if exists "payments: staff and clinic managers read" on public.subscription_payments;
create policy "payments: staff and clinic managers read" on public.subscription_payments for select to authenticated
  using (public.can_manage_clinic(clinic_id));

-- trial · active · grace (up to 7 days after the end) · expired · exempt
create or replace function public.billing_state(p_clinic uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when c.billing_exempt then 'exempt'
    when c.paid_until > now() then 'active'
    when c.paid_until is null and c.trial_ends_at > now() then 'trial'
    when greatest(coalesce(c.paid_until, '-infinity'), coalesce(c.trial_ends_at, '-infinity')) > now() - interval '7 days' then 'grace'
    else 'expired'
  end
  from public.clinics c where c.id = p_clinic;
$$;

-- Expected price in halalas (null = custom price, any amount accepted).
create or replace function public.billing_price(p_plan text, p_cycle text, p_founder boolean)
returns int language sql immutable set search_path = '' as $$
  select (case
            when p_plan = 'starter' then 79900
            when p_plan = 'standard' then case when p_founder then 99900 else 129900 end
            else null end) * (case when p_cycle = 'yearly' then 10 else 1 end);
$$;

-- Records a payment once (idempotent per provider + reference) and extends the subscription
-- from the later of now / current end. Rejects amounts below the plan price.
create or replace function public.billing_record_core(
  p_clinic uuid, p_provider text, p_reference text, p_amount_halalas int, p_cycle text, p_by uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.clinics;
  v_price int;
  v_start timestamptz;
  v_end timestamptz;
begin
  if exists (select 1 from public.subscription_payments where provider = p_provider and reference = p_reference) then
    return jsonb_build_object('duplicate', true, 'paid_until', (select paid_until from public.clinics where id = p_clinic));
  end if;
  select * into c from public.clinics where id = p_clinic for update;
  if c.id is null then raise exception 'clinic_not_found' using errcode = 'P0002'; end if;
  if p_cycle not in ('monthly', 'yearly') then raise exception 'invalid_cycle' using errcode = '22023'; end if;
  v_price := public.billing_price(c.plan, p_cycle, c.founder);
  if p_amount_halalas is null or p_amount_halalas <= 0 or (v_price is not null and p_amount_halalas < v_price) then
    raise exception 'amount_too_low' using errcode = '22023';
  end if;
  v_start := greatest(now(), coalesce(c.paid_until, now()));
  v_end := v_start + case when p_cycle = 'yearly' then interval '1 year' else interval '1 month' end;
  insert into public.subscription_payments
    (clinic_id, provider, reference, amount_halalas, cycle, plan, period_start, period_end, recorded_by)
  values (c.id, p_provider, left(p_reference, 120), p_amount_halalas, p_cycle, c.plan, v_start, v_end, p_by);
  update public.clinics set paid_until = v_end, billing_cycle = p_cycle,
    status = case when status = 'suspended' then 'active'::public.clinic_status else status end
  where id = c.id;
  return jsonb_build_object('duplicate', false, 'paid_until', v_end, 'period_start', v_start);
end $$;

-- Admin page: Circle staff record a manual / bank-transfer payment.
create or replace function public.admin_record_payment(
  p_clinic uuid, p_provider text, p_reference text, p_amount_halalas int, p_cycle text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return public.billing_record_core(p_clinic, p_provider, p_reference, p_amount_halalas, p_cycle, auth.uid());
end $$;

-- n8n: clinics whose trial or paid period ends within p_days, or already lapsed (for reminders).
create or replace function public.billing_due(p_days int default 3)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.ends_at), '[]') from (
    select c.id as clinic_id, c.name as clinic, c.plan, c.founder, c.billing_cycle,
      public.billing_state(c.id) as state,
      coalesce(c.paid_until, c.trial_ends_at) as ends_at,
      greatest(0, ceil(extract(epoch from coalesce(c.paid_until, c.trial_ends_at) - now()) / 86400))::int as days_left,
      public.billing_price(c.plan, c.billing_cycle, c.founder) as price_halalas,
      (select u.email from public.clinic_members m join auth.users u on u.id = m.user_id
        where m.clinic_id = c.id and m.role = 'owner' order by m.created_at limit 1) as owner_email,
      coalesce(s.phone, l.phone) as phone
    from public.clinics c
    left join public.clinic_sites s on s.clinic_id = c.id
    left join public.leads l on l.id = c.lead_id
    where not c.billing_exempt
      and coalesce(c.paid_until, c.trial_ends_at) < now() + make_interval(days => least(greatest(p_days, 0), 31))
      and coalesce(c.paid_until, c.trial_ends_at) > now() - interval '30 days'
  ) x;
$$;

-- Gateway webhook via n8n (service role): same core, recorded_by null.
create or replace function public.billing_record_payment(
  p_clinic uuid, p_provider text, p_reference text, p_amount_halalas int, p_cycle text
) returns jsonb language sql volatile security definer set search_path = '' as $$
  select public.billing_record_core(p_clinic, p_provider, p_reference, p_amount_halalas, p_cycle, null);
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.billing_record_core(uuid, text, text, int, text, uuid)', 'public.billing_due(int)',
    'public.billing_record_payment(uuid, text, text, int, text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
  revoke execute on function public.admin_record_payment(uuid, text, text, int, text) from public, anon;
  grant execute on function public.admin_record_payment(uuid, text, text, int, text) to authenticated;
  revoke execute on function public.billing_state(uuid) from public, anon;
  grant execute on function public.billing_state(uuid) to authenticated;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.billing_state(uuid) to service_role;
  end if;
end $$;

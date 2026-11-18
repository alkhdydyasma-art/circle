-- Online payment (Moyasar hosted invoice page). A checkout row is created before the
-- invoice so the return URL and the callback can only settle invoices Circle created.
-- Server-only: no policies, so only the service role reads or writes it.
create table if not exists public.billing_checkouts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  provider text not null default 'moyasar' check (provider in ('moyasar')),
  invoice_id text unique,
  cycle text not null check (cycle in ('monthly', 'yearly')),
  amount_halalas int not null check (amount_halalas > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired')),
  settled_at timestamptz,
  created_by uuid
);
create index if not exists billing_checkouts_pending_idx on public.billing_checkouts (created_at) where status = 'pending';
alter table public.billing_checkouts enable row level security;
revoke all on public.billing_checkouts from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update on public.billing_checkouts to service_role;
  end if;
end $$;

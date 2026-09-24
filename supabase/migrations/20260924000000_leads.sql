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

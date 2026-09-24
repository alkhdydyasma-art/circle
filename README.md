# Circle (سيركل)

Bilingual (Arabic RTL / English LTR) marketing site for Circle — AI automation for dental clinics.

- Stack: Next.js (App Router) + Tailwind CSS v4
- Routes: `/ar` (default), `/en`
- Texts: `src/i18n/ar.ts`, `src/i18n/en.ts`
- Demo form (3 steps, clinic-specific) → `POST /api/lead` → Supabase `leads` table (+ optional n8n webhook)
- Contact number and WhatsApp links: `src/lib/contact.ts`

## Environment

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key (used server-side only; the browser never talks to Supabase) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key: inserts leads and creates accounts for accepted invitations. Never expose it |
| `SITE_URL` | Public site URL used in invitation links, e.g. `https://circle.sa` |
| `N8N_LEAD_WEBHOOK_URL` | Optional n8n webhook notified of each new lead |
| `N8N_WEBHOOK_SECRET` | Optional, sent as `x-circle-secret` header |

## Develop

```bash
npm install
npm run dev
```

Deploy: import the GitHub repo into Vercel and set the variables above.

## Database

Run the SQL in `supabase/migrations/` in order (Supabase Dashboard → SQL Editor, or `supabase db push`).

Then in Supabase:

1. **Authentication → Sign In / Providers → Email:** turn **off** "Allow new users to sign up".
   Accounts are only created through invitations.
2. **Make yourself a Circle admin:** create your user in *Authentication → Users → Add user*, then run
   ```sql
   insert into public.platform_admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```

## Clinic portal (`/ar/portal`, `/en/portal`)

- **Circle admin**: sees all demo requests and clinics, activates a lead (creates the clinic + an owner
  invitation link to send on WhatsApp), sets status / plan / platform URL.
- **Clinic members**: see only their own clinic. Roles: owner, manager, doctor, reception.
  Owners manage everyone; managers manage doctors and reception; doctors and reception are read-only.

### Security model

- **Tenant isolation in Postgres**: every table has RLS; policies call `is_clinic_member` /
  `can_manage_clinic` / `can_assign_role`, so a bug in the app cannot leak another clinic's data.
- **Guards**: triggers stop non-admins changing subscription fields, moving members between clinics,
  or removing a clinic's last owner. Every change is written to `audit_log`.
- **Sessions**: Supabase tokens live only in `HttpOnly`, `Secure` (in production), `SameSite=Lax`
  cookies; there is no Supabase client in the browser. `src/proxy.ts` refreshes sessions and guards
  `/portal`. Portal pages send `Cache-Control: private, no-store` and `noindex`.
- **Invitations**: 256-bit random tokens; only their SHA-256 is stored; single use; expire after 7 days;
  bound to the invited email.
- **Headers**: HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer and permissions policies.

### Clinic data & public booking

`20260926000000_clinic_data.sql` adds each clinic's public site settings (`clinic_sites`: slug,
template, brand, booking rules), branches, doctors, services, weekly working hours, time off,
patients, clinical notes and appointments.

- **Composite keys** `(clinic_id, id)` on every reference: a row can never point at another
  clinic's doctor, service or patient.
- **Roles**: owner/manager configure the clinic; reception manages patients and appointments;
  doctors see only their own appointments and patients and may change only status/notes.
  Clinical notes (`patient_clinical`) are readable by owners, managers and the treating doctor —
  never reception.
- **Visitors never touch tables.** A published site of an active clinic is served through
  `public_site(slug)`, `available_slots(slug, service, day, doctor?, branch?)` and
  `book_appointment(...)`, which re-checks the slot, reuses the patient by phone and allows at most
  3 open website bookings per phone. A Postgres exclusion constraint makes double-booking a doctor
  impossible, even under concurrent requests.

### Clinic websites & templates (`/ar/c/{slug}`)

Each clinic's public site is rendered from `public_site(slug)` by one of the templates in
`src/templates`:

- `modern` — the clinic's own brand colours.
- `founding_day` (يوم التأسيس) — sand, mud-brick brown and gold with a Sadu-inspired band.
- `national_day` (اليوم الوطني) — deep night with Saudi green and an eight-pointed-star pattern.

Occasion themes fix the colours and add a greeting ribbon; the clinic keeps its logo and font.
They use original geometric motifs only — no flag, emblem or official occasion logos (the flag
carries the Shahada and must not be used as commercial decoration). The brand settings:

```json
{ "primary": "#0e7490", "accent": "#14b8a6", "font": "tajawal", "logo_url": "https://…", "hero_image_url": "https://…" }
```

Fonts: `plex`, `tajawal`, `cairo`, `readex`. Colours are validated, button text colour is chosen by
WCAG contrast, and `content.sections` can hide services / doctors / branches. Pages include
schema.org `Dentist` data for search engines and are regenerated at most once a minute.

**Demo clinic:** run `supabase/seed/demo_clinic.sql` to get a published sample at `/ar/c/noor`
(no real patient data) — useful for sales demos.

### Tests

`supabase/tests/run.sh` loads the migrations into a throwaway Postgres (with a stub of Supabase's
`auth` schema) and runs every `*_test.sql` — 96 tenant-isolation, permission and booking checks:

```bash
PGHOST=localhost PGUSER=postgres supabase/tests/run.sh
```

## Testimonials

`src/i18n/*.ts → testimonials` currently holds illustrative examples, labelled as such on the page.
Replace them with real, approved customer quotes, then set `IS_SAMPLE = false` in `src/components/Testimonials.tsx`.

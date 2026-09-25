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
| `N8N_BOOKING_WEBHOOK_URL` | Optional n8n webhook called after each booking (website or API, event `appointment.booked`, includes `when` and `manage_url`) — see `n8n/` |
| `SITE_URL` | Public site URL, e.g. `https://circle.sa`. Required in production: links and redirects are built from it (behind the proxy the app cannot see its public address) |
| `N8N_LEAD_WEBHOOK_URL` | Optional n8n webhook notified of each new lead |
| `N8N_WEBHOOK_SECRET` | Optional, sent as `x-circle-secret` header |
| `RATE_LIMIT_SALT` | Random secret used to hash client IPs for rate limiting (falls back to the service key) |

## Develop

```bash
npm install
npm run dev
```

Deploy: patient data must stay in Saudi Arabia (PDPL), so production runs self-hosted Supabase + this app +
n8n on one VM in Oracle Cloud Riyadh. Everything is scripted in [`deploy/`](deploy/README.md) (install,
updates, encrypted backups, restore, monitoring). Don't use hosted services outside KSA for patient data.

## Database

Run `supabase/setup.sql` (all migrations concatenated) in the SQL Editor, or the files in
`supabase/migrations/` in order.

Then in Supabase:

1. **Authentication → Sign In / Providers → Email:** turn **off** "Allow new users to sign up".
   Accounts are only created through invitations.
2. **Make yourself a Circle admin:** create your user in *Authentication → Users → Add user*, then run
   ```sql
   insert into public.platform_admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```
3. **Password reset** (`/ar/forgot`): configure SMTP for Auth, and add `{SITE_URL}/auth/callback` to the
   allowed redirect URLs. The email link lands on `/auth/callback`, which opens `/{lang}/reset-password`.

## Clinic portal (`/ar/portal`, `/en/portal`)

- **Circle admin**: sees all demo requests and clinics, activates a lead (creates the clinic + an owner
  invitation link to send on WhatsApp), sets status / plan.
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
- **Rate limiting**: lead form, booking, availability, sign-in, invitations, self-service links and
  the clinic API are limited per hashed IP (or API key) via `rate_limit_hit` in Postgres (`src/lib/rate-limit.ts`).
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

### Online booking (`/ar/c/{slug}/book`)

Four steps: service → doctor (or "any available") → day & time → details. The page loads 14 days of
availability in one call (`GET /api/sites/{slug}/availability`) so empty days are disabled up front.
`POST /api/sites/{slug}/book` validates input, calls `book_appointment` (which re-checks the slot),
and notifies `N8N_BOOKING_WEBHOOK_URL` if set. If someone else takes the slot first, the patient is
told and sent back to a refreshed list of times. The confirmation offers an `.ics` calendar file.

### Clinic dashboard (`/ar/portal/clinic/{id}`)

| Page | Owner / manager | Reception | Doctor |
| --- | --- | --- | --- |
| Today — KPIs, today's list, pending requests | ✓ | ✓ | own appointments |
| Appointments — week view, doctor filter, manual booking | ✓ | ✓ | own (status only) |
| Patients — search, details, visit history | ✓ | ✓ | patients they treat |
| Medical record (allergies, history) | ✓ | — | patients they treat |
| Services · Doctors & hours · Branches | ✓ | — | — |
| Website & brand — template, colours, font, content, booking rules, publish, draft preview | ✓ | — | — |
| Team & settings — members, invitations, activity log | ✓ | — | — |

Every page and action runs as the signed-in user, so these limits are enforced by the RLS policies
(the menu only hides what the database would refuse anyway). Double-booking from the dashboard is
blocked by the same exclusion constraint as online booking. Draft previews live at `/ar/preview/{id}`.

### Automation (`/ar/portal/clinic/{id}/automation`)

- **Clinic API keys** (`ck_…`): shown once, stored as SHA-256, revocable. A key only reaches its
  own clinic — every `/api/v1/*` route calls an `api_*` SQL function that resolves the clinic from
  the key hash. Endpoints: `clinic`, `slots`, `appointments` (book / find by phone),
  `appointments/{id}/reschedule|cancel` (phone must match), `reminders`, `reminders/{id}/sent`.
- **Reminders**: per-clinic on/off and lead time; `GET /api/v1/reminders` returns due visits with a
  fresh self-service link, a formatted `when`, and a ready message; they are never returned twice.
- **Patient self-service link** `/ar/a/{token}`: confirm attendance, cancel, or pick a new time,
  until the clinic's cutoff. Tokens are 256-bit, stored hashed, and replaced on each reminder.
- **Automatic occasions**: optional; switches the site to Founding Day (Feb 20–25) and National Day
  (Sep 20–26) themes.
- **n8n**: importable workflows and WhatsApp template texts in `n8n/`.

### Tests

`supabase/tests/run.sh` loads the migrations into a throwaway Postgres (with a stub of Supabase's
`auth` schema) and runs every `*_test.sql` — 146 tenant-isolation, permission, booking and automation checks:

```bash
PGHOST=localhost PGUSER=postgres supabase/tests/run.sh
```

## Legal pages

`/ar/privacy` and `/ar/terms` (`src/legal/content.ts`) are a **draft that needs lawyer review**. Fill in
the business details in `src/lib/company.ts` (freelance document number, privacy email) before launch.

## Testimonials

`src/i18n/*.ts → testimonials` currently holds illustrative examples, labelled as such on the page.
Replace them with real, approved customer quotes, then set `IS_SAMPLE = false` in `src/components/Testimonials.tsx`.

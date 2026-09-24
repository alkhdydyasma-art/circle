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

### Tests

`supabase/tests/run.sh` loads the migrations into a throwaway Postgres (with a stub of Supabase's
`auth` schema) and runs 44 tenant-isolation and permission checks:

```bash
PGHOST=localhost PGUSER=postgres supabase/tests/run.sh
```

## Testimonials

`src/i18n/*.ts → testimonials` currently holds illustrative examples, labelled as such on the page.
Replace them with real, approved customer quotes, then set `IS_SAMPLE = false` in `src/components/Testimonials.tsx`.

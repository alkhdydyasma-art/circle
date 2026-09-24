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
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key used by `/api/lead` to insert leads. Never expose it to the browser |
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
The `leads` table has RLS enabled with no public policies: only the server can write to it.

## Testimonials

`src/i18n/*.ts → testimonials` currently holds illustrative examples, labelled as such on the page.
Replace them with real, approved customer quotes, then set `IS_SAMPLE = false` in `src/components/Testimonials.tsx`.

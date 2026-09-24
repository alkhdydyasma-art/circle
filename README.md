# Circle (سيركل)

Bilingual (Arabic RTL / English LTR) marketing site for Circle — AI automation for dental clinics.

- Stack: Next.js (App Router) + Tailwind CSS v4
- Routes: `/ar` (default), `/en`
- Texts: `src/i18n/ar.ts`, `src/i18n/en.ts`
- Demo form → `POST /api/lead` → n8n webhook

## Environment

| Variable | Purpose |
| --- | --- |
| `N8N_LEAD_WEBHOOK_URL` | n8n webhook that receives demo requests |
| `N8N_WEBHOOK_SECRET` | Optional, sent as `x-circle-secret` header |

## Develop

```bash
npm install
npm run dev
```

Deploy: import the GitHub repo into Vercel and set the variables above.

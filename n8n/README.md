# n8n workflows for Circle

Two importable workflows (n8n → Workflows → Import from file). Both send WhatsApp messages through
the **WhatsApp Cloud API** using **approved message templates** — WhatsApp only allows free-form
text inside the 24-hour window after the patient's last message, so reminders and confirmations
must be templates.

| File | What it does |
| --- | --- |
| `booking-confirmation.workflow.json` | Receives Circle's `appointment.booked` webhook and sends the patient a confirmation with their self-service link. |
| `reminders.workflow.json` | Every 30 minutes asks Circle for due reminders (`GET /api/v1/reminders`), sends each one, then marks it sent. |

## Setup

1. **n8n variables** (Settings → Variables): `CIRCLE_URL` = `https://your-circle-domain`,
   `WHATSAPP_PHONE_NUMBER_ID` = the phone number id from Meta.
   (No Variables on your plan? Replace `$vars.…` in the HTTP nodes with the literal values.)
2. **Credentials** (all *Header Auth*):
   - *Circle clinic key*: `Authorization` = `Bearer ck_…` — create the key in Circle → **الأتمتة**. One key = one clinic.
   - *WhatsApp Cloud API*: `Authorization` = `Bearer <permanent access token>`.
   - *Circle webhook secret*: `x-circle-secret` = the value of `N8N_WEBHOOK_SECRET` in Vercel.
3. In Vercel set `N8N_BOOKING_WEBHOOK_URL` to the production URL of the “Booking from Circle” node.
4. In Circle → **الأتمتة**, tick “إرسال تذكير واتساب قبل الموعد” and choose how many hours before.
5. Submit the two templates below in Meta Business Manager (category **Utility**, language **ar**)
   and wait for approval before activating the workflows.

## Templates to submit

Both templates carry **no treatment or doctor name** — WhatsApp is processed by Meta outside the
Kingdom, so messages include only what the patient needs to attend (data minimisation under PDPL).

`booking_confirmation` — 5 parameters:

```
مرحباً {{1}} 👋
تم استلام حجزك في {{2}}
📅 {{3}}
📍 {{4}}

لتأكيد الحضور أو تغيير الموعد:
{{5}}
```

`appointment_reminder` — 5 parameters:

```
مرحباً {{1}} 👋
نذكّرك بموعدك في {{2}}
📅 {{3}}
📍 {{4}}

لتأكيد الحضور أو تغيير الموعد:
{{5}}
```

## Several clinics

Each clinic has its own Circle key. Duplicate `reminders.workflow.json` per clinic and give each
copy that clinic's credential (the WhatsApp credential can be shared if you send from one number).

## AI agent

The same key lets an AI agent (n8n AI Agent node, or any tool-calling LLM) work for the clinic:

| Tool | Call |
| --- | --- |
| Clinic facts (RAG context) | `GET /api/v1/clinic` |
| Open times | `GET /api/v1/slots?service=…&day=YYYY-MM-DD[&doctor=…]` |
| Book | `POST /api/v1/appointments` `{ service_id, doctor_id, branch_id, starts_at, full_name, phone, source: "whatsapp" }` |
| Patient's bookings | `GET /api/v1/appointments?phone=05…` |
| Reschedule | `POST /api/v1/appointments/{id}/reschedule` `{ phone, starts_at }` |
| Cancel | `POST /api/v1/appointments/{id}/cancel` `{ phone }` |

Reschedule/cancel require the patient's phone to match the appointment, so the agent can only act
for the person it is chatting with. Changes respect the clinic's cutoff (“too_late_to_change”).

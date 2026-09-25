import { leadSchema, type Lead } from "@/lib/lead-schema";
import { allowRequest, tooMany } from "@/lib/rate-limit";

// Demo requests: validated here, stored in Supabase with the server-only service
// role key (the table has RLS with no public policies), then optionally announced
// to n8n for WhatsApp follow-up. See README for the environment variables.

async function storeInSupabase(lead: Lead) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;

  const res = await fetch(`${url}/rest/v1/leads`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      clinic: lead.clinic,
      city: lead.city,
      clinic_type: lead.clinicType,
      branches: lead.branches,
      chairs: lead.chairs,
      doctors: lead.doctors,
      booking_method: lead.bookingMethod,
      monthly_patients: lead.monthlyPatients,
      needs: lead.needs,
      contact_name: lead.name,
      contact_role: lead.role,
      phone: lead.phone,
      email: lead.email || null,
      consent_at: new Date().toISOString(),
      lang: lead.lang,
    }),
  });
  if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
  return true;
}

async function notifyN8n(lead: Lead) {
  const webhook = process.env.N8N_LEAD_WEBHOOK_URL;
  if (!webhook) return false;

  const res = await fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.N8N_WEBHOOK_SECRET && { "x-circle-secret": process.env.N8N_WEBHOOK_SECRET }),
    },
    body: JSON.stringify({ ...lead, source: "circle-website", submitted_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`n8n ${res.status}`);
  return true;
}

export async function POST(request: Request) {
  if (!(await allowRequest("lead", request))) return tooMany();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  // Honeypot filled → pretend success so bots don't retry.
  if (typeof body.website === "string" && body.website.trim()) {
    return Response.json({ ok: true });
  }

  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_lead", fields: parsed.error.issues.map((i) => i.path.join(".")) },
      { status: 400 },
    );
  }
  const lead = parsed.data;

  // Storage is the source of truth; n8n is best-effort once the lead is saved.
  let stored = false;
  try {
    stored = await storeInSupabase(lead);
  } catch (err) {
    console.error("[lead] supabase insert failed", err);
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }

  let notified = false;
  try {
    notified = await notifyN8n(lead);
  } catch (err) {
    console.error("[lead] n8n webhook failed", err);
    if (!stored) return Response.json({ error: "upstream_failed" }, { status: 502 });
  }

  if (!stored && !notified) {
    console.warn("[lead] neither SUPABASE_* nor N8N_LEAD_WEBHOOK_URL configured; lead dropped");
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  return Response.json({ ok: true });
}

const REQUIRED = ["clinic", "name", "phone", "city", "chairs"] as const;

// Forwards demo requests to n8n, which creates the lead and — on subscription —
// provisions the clinic on the platform. Configure N8N_LEAD_WEBHOOK_URL (+ optional
// N8N_WEBHOOK_SECRET, sent as x-circle-secret) in the hosting environment.
export async function POST(request: Request) {
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

  const lead: Record<string, string> = {};
  for (const key of REQUIRED) {
    const value = typeof body[key] === "string" ? body[key].trim().slice(0, 200) : "";
    if (!value) return Response.json({ error: `missing_${key}` }, { status: 400 });
    lead[key] = value;
  }

  const webhook = process.env.N8N_LEAD_WEBHOOK_URL;
  if (!webhook) {
    console.warn("[lead] N8N_LEAD_WEBHOOK_URL not set; lead not forwarded", lead);
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const res = await fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.N8N_WEBHOOK_SECRET && { "x-circle-secret": process.env.N8N_WEBHOOK_SECRET }),
    },
    body: JSON.stringify({
      ...lead,
      lang: body.lang === "en" ? "en" : "ar",
      source: "circle-website",
      submitted_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    console.error("[lead] n8n webhook failed", res.status);
    return Response.json({ error: "upstream_failed" }, { status: 502 });
  }
  return Response.json({ ok: true });
}

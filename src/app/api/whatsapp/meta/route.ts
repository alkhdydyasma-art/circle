import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { fromN8n } from "@/lib/whatsapp";

// POST /api/whatsapp/meta — called by the n8n "WhatsApp agent" workflow so Meta's secrets stay
// in Circle (Vercel / server env), not inside n8n:
//   { verify_token, challenge }  → Meta's webhook subscription check (WHATSAPP_VERIFY_TOKEN)
//   { signature, raw_b64 }       → checks X-Hub-Signature-256 with WHATSAPP_APP_SECRET and
//                                  returns the patient messages, one per item, for n8n.
// Always answers 200 with { ok }, so n8n's IF node decides what happens next.

const verify = z.object({ verify_token: z.string().max(200), challenge: z.string().max(200) });
const event = z.object({ signature: z.string().max(200), raw_b64: z.string().max(2_000_000) });

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

type Change = {
  value?: {
    metadata?: { phone_number_id?: string };
    contacts?: { wa_id: string; profile?: { name?: string } }[];
    messages?: { from: string; id: string; type: string; text?: { body?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }[];
  };
};

export async function POST(request: Request) {
  if (!fromN8n(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const input = await request.json().catch(() => null);

  const v = verify.safeParse(input);
  if (v.success) {
    const token = process.env.WHATSAPP_VERIFY_TOKEN;
    const ok = !!token && same(v.data.verify_token, token);
    return Response.json(ok ? { ok, challenge: v.data.challenge } : { ok });
  }

  const e = event.safeParse(input);
  if (!e.success) return Response.json({ ok: false, error: "invalid_body" });
  const secret = process.env.WHATSAPP_APP_SECRET;
  const raw = Buffer.from(e.data.raw_b64, "base64");
  const expected = "sha256=" + createHmac("sha256", secret ?? "").update(raw).digest("hex");
  if (!secret || !same(e.data.signature, expected)) return Response.json({ ok: false, error: "bad_signature" });

  let body: { entry?: { changes?: Change[] }[] };
  try { body = JSON.parse(raw.toString("utf8")); } catch { return Response.json({ ok: false, error: "invalid_json" }); }
  const messages = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const val = change.value ?? {};
      const names = new Map((val.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));
      for (const m of val.messages ?? []) {
        messages.push({
          phone_number_id: val.metadata?.phone_number_id ?? null,
          from: m.from, name: names.get(m.from) ?? null, message_id: m.id, type: m.type,
          text: m.type === "text" ? m.text?.body ?? null
            : m.type === "interactive" ? (m.interactive?.button_reply ?? m.interactive?.list_reply)?.title ?? null : null,
        });
      }
    }
  }
  // Status updates (delivered/read) carry no messages: ok with an empty list.
  return Response.json({ ok: true, messages });
}

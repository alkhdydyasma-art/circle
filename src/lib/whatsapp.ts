import "server-only";
import { timingSafeEqual } from "node:crypto";
import { withRetry } from "@/lib/ops";

// WhatsApp goes through n8n: n8n holds the Meta access token, receives Meta's webhook and
// sends messages. Circle talks to n8n only, authenticated by the shared N8N_WEBHOOK_SECRET.

/** Constant-time check of the x-circle-secret header sent by n8n. */
export function fromN8n(request: Request) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const got = request.headers.get("x-circle-secret");
  if (!secret || !got) return false;
  const a = Buffer.from(secret), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Sends a free-text WhatsApp message via n8n (allowed within 24h of the patient's last message).
 *  Retried up to 3 times; failures are recorded in the operations log. */
export async function sendWhatsApp(phoneNumberId: string, to: string, text: string, clinicId?: string) {
  const url = process.env.N8N_SEND_WEBHOOK_URL;
  if (!url) throw new Error("N8N_SEND_WEBHOOK_URL is not set");
  await withRetry("whatsapp", "send via n8n", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.N8N_WEBHOOK_SECRET && { "x-circle-secret": process.env.N8N_WEBHOOK_SECRET }) },
      body: JSON.stringify({ phone_number_id: phoneNumberId, to: to.replace(/^\+/, ""), text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`n8n send ${res.status}`);
  }, { clinicId });
}

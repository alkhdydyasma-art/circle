import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { recordOps } from "@/lib/ops";
import { fromN8n } from "@/lib/whatsapp";

// POST /api/billing/payment — n8n forwards a payment the gateway (Tap / PayTabs / Moyasar)
// has already confirmed. n8n verifies the gateway's signature or re-fetches the charge first;
// Circle then records it once per provider + reference and extends the subscription.
const Body = z.object({
  clinic_id: z.string().uuid(),
  provider: z.enum(["tap", "paytabs", "moyasar", "bank_transfer", "manual"]),
  reference: z.string().trim().min(1).max(120),
  amount_halalas: z.number().int().positive().max(100_000_000),
  cycle: z.enum(["monthly", "yearly"]),
});

export async function POST(request: Request) {
  if (!fromN8n(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const p = parsed.data;
  const { data, error } = await createServiceClient().rpc("billing_record_payment", {
    p_clinic: p.clinic_id, p_provider: p.provider, p_reference: p.reference, p_amount_halalas: p.amount_halalas, p_cycle: p.cycle,
  });
  if (error) {
    const known = ["amount_too_low", "clinic_not_found", "invalid_cycle"].find((k) => error.message.includes(k));
    if (!known) await recordOps("api", "error", `billing_payment: ${error.message}`, p.clinic_id);
    return Response.json({ error: known ?? "server_error" }, { status: known ? 422 : 500 });
  }
  return Response.json({ ok: true, ...(data as object) });
}

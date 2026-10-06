import { createServiceClient } from "@/lib/supabase/server";
import { fromN8n } from "@/lib/whatsapp";

// GET /api/billing/due?days=3 — clinics whose trial or subscription ends within `days`
// or lapsed in the last 30 days. n8n sends the reminders (owner e-mail + founder).
export async function GET(request: Request) {
  if (!fromN8n(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const days = Number(new URL(request.url).searchParams.get("days") ?? 3);
  if (!Number.isInteger(days) || days < 0 || days > 31) return Response.json({ error: "invalid_period" }, { status: 400 });
  const { data, error } = await createServiceClient().rpc("billing_due", { p_days: days });
  if (error) {
    console.error("[billing] due", error.message);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
  const site = (process.env.SITE_URL ?? "").replace(/\/$/, "");
  const clinics = (data as { price_halalas: number | null }[]).map((c) => ({ ...c, price_sar: c.price_halalas === null ? null : c.price_halalas / 100 }));
  return Response.json({ count: clinics.length, clinics, portal_url: site ? `${site}/ar/portal` : null }, { headers: { "Cache-Control": "no-store" } });
}

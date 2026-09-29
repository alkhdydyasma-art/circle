import { createServiceClient } from "@/lib/supabase/server";
import { opsMessage, opsTemplateParams, type OpsSummary } from "@/lib/opsReport";
import { fromN8n } from "@/lib/whatsapp";

// GET /api/ops/summary?days=7 — the founder's periodic operations report (n8n sends it).
export async function GET(request: Request) {
  if (!fromN8n(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const days = Number(new URL(request.url).searchParams.get("days") ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > 31) return Response.json({ error: "invalid_period" }, { status: 400 });
  const to = new Date(), from = new Date(to.getTime() - days * 86400_000);
  const { data, error } = await createServiceClient().rpc("ops_summary", { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) return Response.json({ error: "server_error" }, { status: 500 });
  const s = data as OpsSummary;
  return Response.json({ summary: s, message: opsMessage(s, days), template_params: opsTemplateParams(s, days) }, { headers: { "Cache-Control": "no-store" } });
}

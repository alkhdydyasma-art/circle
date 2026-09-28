import { json, keyHash, rpc } from "@/lib/clinic-api";
import { reportMessage, reportTemplateParams, type Report } from "@/lib/reports";

// GET /api/v1/reports?days=7 — the clinic's summary for the last N days (1–92), plus a
// ready-to-send Arabic WhatsApp message. Counts only; used by the weekly n8n report.
export async function GET(request: Request) {
  const key = await keyHash(request);
  if (key instanceof Response) return key;
  const days = Number(new URL(request.url).searchParams.get("days") ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > 92) return json({ error: "invalid_period" }, 400);
  const res = await rpc<Report>("api_report", { p_key_hash: key, p_days: days });
  if (res instanceof Response) return res;
  return json({ report: res.data, message: reportMessage(res.data), template_params: reportTemplateParams(res.data) });
}

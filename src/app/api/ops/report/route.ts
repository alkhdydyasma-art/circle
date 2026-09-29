import { z } from "zod";
import { recordOps } from "@/lib/ops";
import { fromN8n } from "@/lib/whatsapp";

// POST /api/ops/report — n8n's "Circle error reporter" workflow sends every failed
// execution here, so n8n errors join the same incidents, auto-fix and summary.
const body = z.object({
  workflow: z.string().max(120), node: z.string().max(120).optional().nullable(), message: z.string().max(2000),
});

export async function POST(request: Request) {
  if (!fromN8n(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const p = body.safeParse(await request.json().catch(() => null));
  if (!p.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  await recordOps("n8n", "error", `${p.data.workflow}${p.data.node ? ` › ${p.data.node}` : ""}: ${p.data.message}`);
  return Response.json({ ok: true });
}

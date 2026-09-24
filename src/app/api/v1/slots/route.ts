import { z } from "zod";
import { keyHash, json, rpc } from "@/lib/clinic-api";

const q = z.object({
  service: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  doctor: z.string().uuid().optional(),
  branch: z.string().uuid().optional(),
});

// GET /api/v1/slots?service=…&day=YYYY-MM-DD[&doctor=…][&branch=…] — open times (clinic-local day).
export async function GET(request: Request) {
  const key = keyHash(request);
  if (key instanceof Response) return key;
  const sp = new URL(request.url).searchParams;
  const p = q.safeParse({ service: sp.get("service"), day: sp.get("day"), doctor: sp.get("doctor") || undefined, branch: sp.get("branch") || undefined });
  if (!p.success) return json({ error: "invalid_request", issues: p.error.issues.map((i) => i.path.join(".")) }, 400);
  const res = await rpc("api_slots", { p_key_hash: key, p_service: p.data.service, p_day: p.data.day, p_doctor: p.data.doctor ?? null, p_branch: p.data.branch ?? null });
  return res instanceof Response ? res : json({ slots: res.data });
}

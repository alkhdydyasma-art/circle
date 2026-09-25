import { z } from "zod";
import { keyHash, json, rpc } from "@/lib/clinic-api";

// POST /api/v1/reminders/{id}/sent — mark as reminded so it isn't sent twice.
export async function POST(request: Request, { params }: RouteContext<"/api/v1/reminders/[id]/sent">) {
  const key = await keyHash(request);
  if (key instanceof Response) return key;
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return json({ error: "invalid_request" }, 400);
  const res = await rpc("api_mark_reminded", { p_key_hash: key, p_appt: id.data });
  return res instanceof Response ? res : json({ ok: true });
}
